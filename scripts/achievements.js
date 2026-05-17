/* ---------- Achievements (1000+) ---------- */
const ACHIEVEMENT_DEFS = (function(){
  const out = [];
  // Score (run-best) milestones: every 100 from 100..100000 = 1000 entries
  for(let s=100; s<=100000; s+=100){
    out.push({ id:"sc_"+s, cat:"score", icon:"i-star", titleKey:"ach.score.t", descKey:"ach.score.d", n:s, kind:"runBest" });
  }
  // Sparse high-end run-best milestones every 2500 from 102500..250000
  for(let s=102500; s<=250000; s+=2500){
    out.push({ id:"sc_"+s, cat:"score", icon:"i-star", titleKey:"ach.score.t", descKey:"ach.score.d", n:s, kind:"runBest" });
  }
  // Cumulative-score milestones every 500 from 500..100000
  for(let s=500; s<=100000; s+=500){
    out.push({ id:"sct_"+s, cat:"score", icon:"i-star", titleKey:"ach.score.cum.t", descKey:"ach.score.cum.d", n:s, kind:"totalScore" });
  }
  // Lines milestones every 5 up to 500
  for(let n=5; n<=500; n+=5){
    out.push({ id:"ln_"+n, cat:"lines", icon:"i-grid", titleKey:"ach.lines.t", descKey:"ach.lines.d", n, kind:"linesTotal" });
  }
  // Combo from x2..x8
  for(let n=2; n<=8; n++){
    out.push({ id:"cb_"+n, cat:"combo", icon:"i-flame", titleKey:"ach.combo.t", descKey:"ach.combo.d", n, kind:"comboBest" });
  }
  // Games milestones
  [1,5,10,25,50,100,200,500,1000,2000,5000].forEach(n=>{
    out.push({ id:"gm_"+n, cat:"games", icon:"i-trophy", titleKey:"ach.games.t", descKey:"ach.games.d", n, kind:"gamesPlayed" });
  });
  // Level milestones
  [2,5,10,15,20,30,50,75,100,150,200,250,300,400,500].forEach(n=>{
    out.push({ id:"lv_"+n, cat:"xp", icon:"i-bolt", titleKey:"ach.xp.t", descKey:"ach.xp.d", n, kind:"levelReached" });
  });
  // Hidden achievements (8 named ones)
  out.push({ id:"h_first_place", cat:"hidden", icon:"i-rocket", titleKey:"ach.h.1.t", descKey:"ach.h.1.d", n:0, kind:"hidden", flag:"firstPlace" });
  out.push({ id:"h_triple",      cat:"hidden", icon:"i-flame",  titleKey:"ach.h.2.t", descKey:"ach.h.2.d", n:0, kind:"hidden", flag:"tripleClear" });
  out.push({ id:"h_quad",        cat:"hidden", icon:"i-flame",  titleKey:"ach.h.3.t", descKey:"ach.h.3.d", n:0, kind:"hidden", flag:"quadClear" });
  out.push({ id:"h_adept",       cat:"hidden", icon:"i-clock",  titleKey:"ach.h.4.t", descKey:"ach.h.4.d", n:7, kind:"loginDays" });
  out.push({ id:"h_speedrun",    cat:"hidden", icon:"i-bolt",   titleKey:"ach.h.5.t", descKey:"ach.h.5.d", n:0, kind:"hidden", flag:"speedrun" });
  out.push({ id:"h_pacifist",    cat:"hidden", icon:"i-target", titleKey:"ach.h.6.t", descKey:"ach.h.6.d", n:0, kind:"hidden", flag:"pacifist" });
  out.push({ id:"h_survivor",    cat:"hidden", icon:"i-target", titleKey:"ach.h.7.t", descKey:"ach.h.7.d", n:0, kind:"hidden", flag:"survivor" });
  out.push({ id:"h_cleaner",     cat:"hidden", icon:"i-grid",   titleKey:"ach.h.8.t", descKey:"ach.h.8.d", n:0, kind:"hidden", flag:"cleaner" });
  return out;
})();
function totalAchievementsCount(){ return ACHIEVEMENT_DEFS.length; }
function unlockAch(id, titleKey, descKey, icon){
  if(state.achievements.has(id)) return;
  state.achievements.add(id);
  toast(t("toast.unlocked") + ": " + t(titleKey, {n:0}), "success");
  beep(1200, 100, "triangle");
  /* Coalesce: a single placement that triggers triple-clear + cleaner
     + a score milestone used to fire 3 full saveState() writes back
     to back. The microtask scheduler folds them into one. */
  requestSaveState();
  renderProfile(); renderAchievements();
}
function evaluateAchievements(){
  // Score (best run)
  const bestRun = state.stats.bestRun||0;
  ACHIEVEMENT_DEFS.forEach(def=>{
    if(state.achievements.has(def.id)) return;
    let unlocked = false;
    switch(def.kind){
      case "runBest": unlocked = bestRun >= def.n; break;
      case "totalScore": unlocked = (state.stats.totalScoreFromGames||state.stats.totalScore||0) >= def.n; break;
      case "linesTotal": unlocked = (state.stats.lines||0) >= def.n; break;
      case "comboBest": unlocked = (state.stats.bestCombo||1) >= def.n; break;
      case "gamesPlayed": unlocked = (state.stats.games||0) >= def.n; break;
      case "levelReached": unlocked = levelInfo(state.stats.xp).lvl >= def.n; break;
      case "loginDays": unlocked = (state.profile.loginDays||[]).length >= def.n; break;
      case "hidden": unlocked = !!state.hidden[def.flag]; break;
    }
    if(unlocked){
      state.achievements.add(def.id);
      toast(t("toast.unlocked") + ": " + t(def.titleKey,{n:def.n}), "success");
      beep(1100, 90, "triangle");
    }
  });
  /* Same coalescing rationale as unlockAch above — and crucially this
     loop runs once per placement, so the savings stack. */
  requestSaveState();
}
let achFilter = "all", achQuery = "";
function renderAchievements(){
  const grid = $("#ach-grid");
  if(!grid) return;
  const q = achQuery.toLowerCase().trim();
  // For performance, lazy render: render up to 400 items at a time? Acceptable to render all but virtualize via cap if necessary.
  // Sort: unlocked first then by id
  const list = ACHIEVEMENT_DEFS.filter(def=>{
    const unlocked = state.achievements.has(def.id);
    if(achFilter === "unlocked" && !unlocked) return false;
    if(achFilter === "locked" && unlocked) return false;
    if(q){
      const title = t(def.titleKey,{n:def.n}).toLowerCase();
      const desc  = t(def.descKey,{n:def.n}).toLowerCase();
      if(!title.includes(q) && !desc.includes(q) && !def.id.includes(q)) return false;
    }
    return true;
  });
  // Cap render to first 600 for DOM perf; user can search to narrow
  const cap = 600;
  const slice = list.slice(0, cap);
  grid.innerHTML = "";
  const frag = document.createDocumentFragment();
  slice.forEach(def=>{
    const unlocked = state.achievements.has(def.id);
    const el = document.createElement("div");
    el.className = "ach" + (unlocked ? " unlocked" : "");
    const iconUse = unlocked ? def.icon : "i-lock";
    el.innerHTML = `
      <div class="ic"><svg class="ic-svg lg"><use href="#${iconUse}"/></svg></div>
      <div style="min-width:0">
        <div class="t"></div>
        <div class="d"></div>
      </div>
      <div class="meta">${def.cat[0].toUpperCase()+def.cat.slice(1)}</div>
    `;
    el.querySelector(".t").textContent = t(def.titleKey,{n:def.n});
    el.querySelector(".d").textContent = t(def.descKey,{n:def.n});
    frag.appendChild(el);
  });
  grid.appendChild(frag);
  if(list.length > cap){
    const more = document.createElement("div");
    more.className = "ach";
    more.style.justifyContent = "center";
    more.style.opacity = "1";
    more.innerHTML = `<div class="t">+${list.length - cap}…</div>`;
    grid.appendChild(more);
  }
  $("#ach-progress").textContent = state.achievements.size + "/" + ACHIEVEMENT_DEFS.length;
}

