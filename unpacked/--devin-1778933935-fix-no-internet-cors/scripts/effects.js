/* ---------- Visual effects layer ----------
   Floating score popups and radial particle bursts rendered into
   #fx-layer. Each effect is self-cleaning (timed `remove()`). The
   layer is pointer-events: none, so it never interferes with input.
   All animations honor prefers-reduced-motion via CSS. */

(function(){
  function layer(){ return document.getElementById("fx-layer"); }

  /* ---------- DOM pools ----------
     Both popup() and burst() used to .createElement() + .remove() one
     node per particle / label. A 4-line combo burst with linePop +
     celebrateCombo at the same time can spawn ~80 DOM nodes inside a
     single animation frame, which on bottom-tier phones blew the
     16 ms budget twice over.

     We now keep two pools:
       - _popupPool: at most 16 reusable popup nodes
       - _particlePool: at most 256 reusable particle nodes

     A node is "free" when it's been added to the pool, "in use" once
     handed out by `_takeFromPool`. When its lifetime expires we just
     hide it (display:none) and push it back — the node never leaves
     the fx-layer's child list, so no insertion/removal cost on the
     hot path. The pool caps are well above any reasonable burst, so
     in practice we allocate the first N nodes once and reuse forever. */
  const _popupPool = [];
  const _particlePool = [];
  const POPUP_POOL_CAP = 16;
  const PARTICLE_POOL_CAP = 256;

  function _takeFromPool(pool, root, cls){
    let el = pool.pop();
    if(!el){
      el = document.createElement("div");
      el.className = cls;
      root.appendChild(el);
    } else {
      el.className = cls;
      el.style.display = "";
    }
    return el;
  }
  function _release(pool, el, cap){
    /* Animation can leave inline styles behind that would bleed into
       the next reuse. Resetting before parking the node keeps every
       reuse start from a clean slate. */
    el.style.animation = "none";
    /* Force a reflow so removing+re-adding the animation actually
       restarts it on the next take. Reading offsetHeight is the
       cheapest cross-browser way to flush the style change. */
    void el.offsetHeight;
    el.style.animation = "";
    el.style.cssText = "";
    el.style.display = "none";
    el.textContent = "";
    if(pool.length < cap) pool.push(el);
    else el.remove();
  }

  /* Pop a label at viewport coordinates (x, y in CSS pixels). */
  function popup(text, x, y, kind){
    const root = layer();
    if(!root) return;
    const cls = "fx-popup" + (kind ? " " + kind : "");
    const el = _takeFromPool(_popupPool, root, cls);
    el.style.left = x + "px";
    el.style.top = y + "px";
    el.textContent = text;
    setTimeout(()=> _release(_popupPool, el, POPUP_POOL_CAP), 1200);
  }

  /* Radial particle burst centered at (x, y).
     `colors` is an array of CSS colors; `count` controls density. */
  function burst(x, y, opts){
    const root = layer();
    if(!root) return;
    const {
      count   = 18,
      colors  = ["#7c5cff", "#24bdff", "#3ddc97", "#ffb454", "#f25c8e"],
      spread  = 110,
      size    = 9,
    } = opts || {};
    for(let i = 0; i < count; i++){
      const p = _takeFromPool(_particlePool, root, "fx-particle");
      const angle = (Math.PI * 2 * i) / count + (Math.random() * 0.6 - 0.3);
      const dist  = spread * (0.55 + Math.random() * 0.55);
      const dx = Math.cos(angle) * dist;
      const dy = Math.sin(angle) * dist;
      const rot = (Math.random() * 720 - 360) + "deg";
      const sz = size * (0.8 + Math.random() * 0.7);
      p.style.left = x + "px";
      p.style.top  = y + "px";
      p.style.width  = sz + "px";
      p.style.height = sz + "px";
      p.style.background = colors[i % colors.length];
      p.style.setProperty("--dx", dx + "px");
      p.style.setProperty("--dy", dy + "px");
      p.style.setProperty("--rot", rot);
      setTimeout(()=> _release(_particlePool, p, PARTICLE_POOL_CAP), 1000);
    }
  }

  /* Full-screen flash, used for big moments (level up, mega combo).
     Only one flash node exists ever — repeated triggers just re-show
     the same element and restart its animation. */
  let _flashEl = null;
  function flash(){
    const root = layer();
    if(!root) return;
    if(!_flashEl){
      _flashEl = document.createElement("div");
      _flashEl.className = "fx-flash";
      root.appendChild(_flashEl);
    } else {
      _flashEl.style.animation = "none";
      void _flashEl.offsetHeight;
      _flashEl.style.animation = "";
      _flashEl.style.display = "";
    }
    const target = _flashEl;
    setTimeout(()=>{ if(target === _flashEl) target.style.display = "none"; }, 500);
  }

  /* Centered "LEVEL UP" celebration: flash + popup + burst + sound. */
  function celebrateLevelUp(level){
    const vw = window.innerWidth, vh = window.innerHeight;
    const cx = vw / 2, cy = vh * 0.42;
    flash();
    popup((window.t ? window.t("fx.lvlup") : "LEVEL UP") + " " + level, cx, cy, "score");
    burst(cx, cy, { count: 28, spread: 180, size: 11 });
    if(typeof sfx !== "undefined") sfx.lvlup();
    if(typeof vibrate === "function") vibrate([16, 30, 16]);
  }

  /* Combo flourish at the board center. */
  function celebrateCombo(n, anchorEl){
    let cx, cy;
    if(anchorEl){
      const r = anchorEl.getBoundingClientRect();
      cx = r.left + r.width / 2;
      cy = r.top + r.height / 2;
    } else {
      cx = window.innerWidth / 2;
      cy = window.innerHeight / 2;
    }
    popup((window.t ? window.t("fx.combo") : "COMBO") + " x" + n, cx, cy - 24, "combo");
    burst(cx, cy, { count: 14 + Math.min(20, n * 2), spread: 90 + n * 8, size: 8 });
    if(typeof sfx !== "undefined") sfx.combo(n);
  }

  /* "+12" style score popup, anchored to a viewport coord. */
  function scorePop(amount, x, y){
    popup("+" + amount, x, y, "score");
  }

  /* "Line cleared" small burst at a row's midpoint. */
  function linePop(x, y, count){
    popup(count > 1 ? (count + "×") : "", x, y, "combo");
    burst(x, y, { count: 10 + count * 4, spread: 70, size: 7 });
  }

  window.fx = { popup, burst, flash, scorePop, linePop, celebrateLevelUp, celebrateCombo };
})();
