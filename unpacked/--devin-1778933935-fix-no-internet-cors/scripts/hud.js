/* ---------- HUD / panels ---------- */
function updateHUD(){
  if(!state.run) return;
  $("#hud-score").textContent = state.run.score;
  $("#hud-best").textContent = state.stats.best;
  $("#hud-lines").textContent = state.run.lines;
  $("#hud-combo").textContent = "x"+state.run.combo;
  $("#side-streak").textContent = state.run.streak;
  $("#side-placed").textContent = state.run.placedThisRun;
  // XP
  const { lvl, into, need } = levelInfo(state.stats.xp);
  $("#side-level").textContent = lvl;
  $("#side-xp").textContent = into + "/" + need;
  $("#side-xp-bar").style.width = ((into/need)*100).toFixed(1) + "%";
  // Menu pill stays in sync with progression
  const menuLevel = document.getElementById("menu-level");
  if (menuLevel) menuLevel.textContent = lvl;
  const menuCardLevel = document.getElementById("menu-card-level");
  if (menuCardLevel) menuCardLevel.textContent = lvl;
  const menuBest = document.getElementById("menu-best");
  if (menuBest) menuBest.textContent = (state.stats.best || 0).toLocaleString();
  const menuCardBest = document.getElementById("menu-card-best");
  if (menuCardBest) menuCardBest.textContent = (state.stats.best || 0).toLocaleString();
}

function refreshAllUI(){
  applyI18n();
  updateHUD();
  renderStats();
  renderProfile();
  renderTasks();
  renderLeaderboards();
  renderAchievements();
  if (typeof renderMenu === "function") renderMenu();
}

/* ---------- Stats ---------- */
function renderStats(){
  $("#s-games").textContent = state.stats.games||0;
  $("#s-best").textContent = state.stats.best||0;
  const avg = (state.stats.games||0) === 0 ? 0 : Math.round((state.stats.best && state.stats.bestRun ? state.stats.bestRun : 0) / 1) ; // we'll compute via running sum
  $("#s-avg").textContent = computeAvgScore();
  $("#s-time").textContent = fmtTime(state.stats.totalTimeMs||0);
  $("#s-lines").textContent = state.stats.lines||0;
  $("#s-combo").textContent = "x"+(state.stats.bestCombo||1);
  $("#s-run").textContent = state.stats.bestRun||0;
  $("#s-xp").textContent = state.stats.xp||0;
}
function computeAvgScore(){
  // we only have totalScore from cell placements & bestRun — better: store totalScoreFromGames
  const tsg = state.stats.totalScoreFromGames || 0;
  const g = state.stats.games || 0;
  if(g === 0) return 0;
  return Math.round(tsg / g);
}

/* ---------- Profile ---------- */
function renderProfile(){
  $("#prof-name").textContent = state.profile.nickname || "Player";
  $("#prof-id").textContent = "ID • " + (state.profile.id || "—");
  $("#prof-avatar").textContent = (state.profile.nickname||"P").slice(0,1).toUpperCase();
  $("#p-best").textContent = state.stats.best||0;
  $("#p-run").textContent = state.stats.bestRun||0;
  $("#p-games").textContent = state.stats.games||0;
  $("#p-avg").textContent = computeAvgScore();
  const d = new Date(state.profile.registeredAt||Date.now());
  $("#p-reg").textContent = d.toLocaleDateString();
  $("#p-unlocked").textContent = state.achievements.size + "/" + totalAchievementsCount();
  $("#p-lines").textContent = state.stats.lines||0;
  $("#p-combo").textContent = "x"+(state.stats.bestCombo||1);
  const { lvl, into, need } = levelInfo(state.stats.xp);
  $("#prof-level").textContent = lvl;
  $("#prof-xp").textContent = into + "/" + need;
  $("#prof-xp-bar").style.width = ((into/need)*100).toFixed(1) + "%";
}

