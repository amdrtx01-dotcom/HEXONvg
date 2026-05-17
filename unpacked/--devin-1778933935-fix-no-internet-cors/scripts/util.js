/* ---------- Util ---------- */
const $ = sel => document.querySelector(sel);
const $$ = sel => document.querySelectorAll(sel);
function genId(){
  return "HX-" + Math.random().toString(36).slice(2,7).toUpperCase()
       + "-" + Math.random().toString(36).slice(2,7).toUpperCase();
}
function todayKey(){
  const d = new Date();
  return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
}
function fmtTime(ms){
  const s = Math.floor(ms/1000);
  const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = s%60;
  if(h>0) return h+"h "+m+"m";
  if(m>0) return m+"m "+sec+"s";
  return sec+"s";
}
function clamp(n,a,b){return Math.max(a,Math.min(b,n))}

/* deterministic RNG */
function mulberry32(seed){
  return function(){
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function hashStr(s){
  let h = 2166136261 >>> 0;
  for(let i=0;i<s.length;i++){
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/* ---------- Audio engine ----------
   A tiny synth on top of WebAudio. We keep a single shared
   AudioContext (created lazily on first user gesture), then
   build short envelope-shaped tones. `beep()` keeps its legacy
   shape so existing call sites keep working; `tone()` is the
   richer primitive used by `sfx.*` presets. */
let audioCtx = null;
let masterGain = null;
function ensureAudio(){
  if(audioCtx) return;
  try{
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = audioCtx.createGain();
    /* Lowered from 0.85 -> 0.55 so every sfx feels softer at the same
       relative oscillator gains. Players can still mute via settings. */
    masterGain.gain.value = 0.55;
    masterGain.connect(audioCtx.destination);
  }catch{}
}
/* Resume context on first interaction — required by Chrome/Safari
   autoplay policies. Bound once via main.js. */
function resumeAudio(){
  ensureAudio();
  if(audioCtx && audioCtx.state === "suspended"){
    audioCtx.resume().catch(()=>{});
  }
}
/* Shape: { freq, dur, type, attack, release, gain, detune, slide } */
function tone(opts){
  if(!state.settings.sound) return;
  ensureAudio();
  if(!audioCtx) return;
  const {
    freq = 440,
    dur  = 120,
    type = "sine",
    /* Longer attack on most sfx turns the old click-y onset into a
       gentle swell. Most presets override to a still-short value
       so transient sounds (click, hover) stay crisp, but anything
       voice-like (place, clear, combo, lvlup) inherits this slower
       fade-in. */
    attack  = 0.018,
    /* Slower release adds tail / room reverb-like decay. */
    release = 0.16,
    gain    = 0.08,
    detune  = 0,
    slide   = null,           // [startFreq, endFreq] for a pitch glide
  } = opts || {};
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = type;
  o.detune.value = detune;
  if(slide){
    o.frequency.setValueAtTime(slide[0], audioCtx.currentTime);
    o.frequency.exponentialRampToValueAtTime(Math.max(40, slide[1]), audioCtx.currentTime + dur/1000);
  } else {
    o.frequency.value = freq;
  }
  o.connect(g); g.connect(masterGain || audioCtx.destination);
  const now = audioCtx.currentTime;
  const peak = Math.max(0.0005, gain);
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(peak, now + attack);
  /* Hold briefly at peak before the decay so a 55ms note still has
     a perceptible "body" even with a long release tail. */
  const hold = Math.max(0, dur/1000 - attack - 0.01);
  g.gain.setValueAtTime(peak, now + attack + hold);
  g.gain.exponentialRampToValueAtTime(0.0002, now + attack + hold + release);
  o.start(now);
  o.stop(now + attack + hold + release + 0.05);
}
/* Backwards-compatible: simple sine tone. */
function beep(freq, dur, type){
  tone({ freq, dur, type: type || "sine", gain: 0.05 });
}
/* Curated effect presets (frequencies in Hz, dur in ms). Tuned to be
   soft & pleasant — sines + triangles, low gains, longer releases,
   slight detune on doubled voices for a warm chorus-like thickness. */
const sfx = {
  /* Quick UI transients keep a short attack so the response feels
     instant — but with a gentler triangle wave instead of pure sine. */
  click()   { tone({ freq: 620, dur: 30,  type: "triangle", gain: 0.030, attack: 0.004, release: 0.10 }); },
  hover()   { tone({ freq: 880, dur: 22,  type: "sine",     gain: 0.014, attack: 0.004, release: 0.08 }); },
  /* Two-voice pad with a perfect fifth above the root + slight detune
     for a "wooden hex" tap. */
  place()   {
    tone({ freq: 440, dur: 90, type: "triangle", gain: 0.040, attack: 0.012, release: 0.18, detune: -3 });
    tone({ freq: 660, dur: 90, type: "sine",     gain: 0.022, attack: 0.012, release: 0.18, detune: +4 });
  },
  /* Slightly muted minor-second wobble — clearly "wrong" but not harsh. */
  invalid() {
    tone({ freq: 220, dur: 110, type: "triangle", gain: 0.030, attack: 0.010, release: 0.16, slide: [240, 170] });
  },
  /* Two-octave shimmer with a soft fifth on top. */
  clear()   {
    tone({ freq: 523, dur: 130, type: "sine",     gain: 0.045, attack: 0.012, release: 0.22 });
    tone({ freq: 784, dur: 150, type: "triangle", gain: 0.028, detune: 5, attack: 0.012, release: 0.26 });
    tone({ freq: 1046,dur: 170, type: "sine",     gain: 0.018, attack: 0.020, release: 0.30 });
  },
  /* Major triad pad: root + third + fifth simultaneously. The base
     frequency walks up with combo length to reward streaks. */
  combo(n)  {
    const base = 440 + Math.min(8, n) * 40;
    tone({ freq: base,        dur: 90,  type: "triangle", gain: 0.040, attack: 0.014, release: 0.22 });
    tone({ freq: base * 1.25, dur: 120, type: "sine",     gain: 0.030, attack: 0.014, release: 0.24 });
    tone({ freq: base * 1.5,  dur: 140, type: "triangle", gain: 0.022, attack: 0.014, release: 0.26 });
  },
  lvlup()   {
    /* Major triad arpeggio over ~700ms with a sustained pad layered
       beneath the last note for a "level up shimmer". */
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      setTimeout(()=> tone({ freq: f, dur: 180, type: "triangle", gain: 0.040, attack: 0.014, release: 0.22 }), i * 75);
    });
    setTimeout(()=> tone({ freq: 523.25, dur: 400, type: "sine", gain: 0.022, attack: 0.040, release: 0.40 }), 230);
  },
  /* Descending perfect-fourth fall — minor feel without the dissonance. */
  gameover(){
    [440, 392, 349.23, 293.66].forEach((f, i) => {
      setTimeout(()=> tone({ freq: f, dur: 220, type: "sine", gain: 0.040, attack: 0.020, release: 0.30 }), i * 110);
    });
  },
  toast()       { tone({ freq: 820, dur: 35, type: "sine", gain: 0.024, attack: 0.006, release: 0.10 }); },
  modalOpen()   { tone({ freq: 480, dur: 90, type: "triangle", gain: 0.028, attack: 0.012, release: 0.18, slide: [380, 540] }); },
  modalClose()  { tone({ freq: 380, dur: 80, type: "triangle", gain: 0.024, attack: 0.012, release: 0.18, slide: [540, 380] }); },
  /* Wallet & shop sounds — chime-style, deliberately gentle. */
  coinUp()    {
    tone({ freq: 880, dur: 80, type: "sine",     gain: 0.040, attack: 0.010, release: 0.20 });
    setTimeout(()=> tone({ freq: 1318, dur: 100, type: "sine", gain: 0.025, attack: 0.012, release: 0.22 }), 45);
  },
  coinSpend() {
    tone({ freq: 660, dur: 70, type: "triangle", gain: 0.030, attack: 0.010, release: 0.16 });
    setTimeout(()=> tone({ freq: 520, dur: 90, type: "sine", gain: 0.022, attack: 0.012, release: 0.20 }), 40);
  },
  coinJackpot(){
    /* Daily-reward fanfare: ascending pentatonic over ~600ms with a
       low sustained drone for warmth. */
    [523, 659, 784, 988, 1175].forEach((f, i) => {
      setTimeout(()=> tone({ freq: f, dur: 150, type: "triangle", gain: 0.034, attack: 0.012, release: 0.22 }), i * 95);
    });
    tone({ freq: 261.6, dur: 700, type: "sine", gain: 0.020, attack: 0.060, release: 0.40 });
  },
  shopOpen()  { tone({ freq: 540, dur: 90, type: "triangle", gain: 0.030, attack: 0.012, release: 0.20, slide: [380, 620] }); },
  shopEquip() {
    tone({ freq: 740, dur: 100, type: "triangle", gain: 0.035, attack: 0.012, release: 0.20 });
    setTimeout(()=> tone({ freq: 988, dur: 130, type: "sine", gain: 0.026, attack: 0.012, release: 0.24 }), 60);
  },
};
function vibrate(p){ if(state.settings.vibration && navigator.vibrate) navigator.vibrate(p); }

/* ---------- Toast ---------- */
function toast(msg, kind){
  const stack = $("#toast-stack");
  const el = document.createElement("div");
  el.className = "toast " + (kind || "info");
  el.innerHTML = '<svg class="ic-svg"><use href="#i-'+(kind==="success"?"check":"bolt")+'"/></svg><span></span>';
  el.querySelector("span").textContent = msg;
  stack.appendChild(el);
  setTimeout(()=>{ el.style.transition="opacity .25s, transform .25s"; el.style.opacity="0"; el.style.transform="translateY(8px)"; }, 1800);
  setTimeout(()=> el.remove(), 2200);
}

