/* ============================================================
   HEXON BETA — In-game boosters
   ============================================================
   Boosters are one-shot consumable power-ups bought from the
   "Бусти" tab in the shop and spent from the booster bar that
   sits above the game board (see #booster-bar in index.html).

   The five booster types:

     - shuffle   — regenerates the tray (3 new pieces) instantly.
                   Costs nothing to *use* once owned; instant action,
                   no targeting needed.
     - bomb      — arms a 3×3 strike. Next valid board cell tap
                   becomes the centre of the bomb and clears the
                   square around it.
     - lightning — arms a row+column strike. Next board cell tap
                   clears that whole row and column.
     - hint      — finds the placement that would score the most
                   (cells placed + lines cleared, weighted lightly
                   toward line clears) and briefly highlights its
                   cells in green. Does NOT auto-place — the player
                   still drags the piece. Pure visual aid.
     - skip      — arms "skip a tray piece". Next tap on a tray
                   piece deletes it (no penalty, no scoring) and
                   refills if it was the last one.

   The booster bar is rendered on:
     - game-screen entry          (hooked via go() in ui.js)
     - shop purchase              (paintBoostGrid → renderBoosterBar)
     - direct booster consumption (always re-renders self)

   Armed state is held in module-local `armed` ("bomb"|"lightning"|
   "skip"|null). While armed, capture-phase listeners on #board /
   #tray intercept clicks BEFORE the drag handlers (game.js) so the
   booster lands instead of starting a drag. The flag is cleared on
   consumption, on tapping the same slot again (toggle off), or on
   any toast cancel button. ============================================================ */
"use strict";

/* The order here matches the booster bar slots left-to-right and
   the shop card layout. Each entry maps the booster id to the SVG
   sprite it uses and the slot accent colour. */
const BOOSTERS = [
  { id:"shuffle",   icon:"#i-shuffle", accent:"#24bdff" },
  { id:"bomb",      icon:"#i-bomb",    accent:"#ff7a59" },
  { id:"lightning", icon:"#i-light",   accent:"#ffe066" },
  { id:"hint",      icon:"#i-hint",    accent:"#3ddc97" },
  { id:"skip",      icon:"#i-skip",    accent:"#a766ff" },
];

let armed = null; // null | "bomb" | "lightning" | "skip"

/* ---------- Public API ---------- */
function getBoosterCount(id){
  if(!state || !state.boosts) return 0;
  return (state.boosts[id] | 0);
}
function setBoosterCount(id, n){
  if(!state.boosts) state.boosts = { shuffle:0, bomb:0, lightning:0, hint:0, skip:0 };
  state.boosts[id] = Math.max(0, n | 0);
}
function spendBooster(id){
  const cur = getBoosterCount(id);
  if(cur <= 0) return false;
  setBoosterCount(id, cur - 1);
  /* Coalesced — boosters get bought/spent in clusters during a
     combo and we don't need 5 disk writes for it. */
  if(typeof requestSaveState === "function") requestSaveState();
  else saveState();
  return true;
}

/* ---------- Booster bar render ----------
   Rebuilds the 5 slots inside #booster-bar. Cheap to call — five
   DOM nodes, no animations. Tolerant of being called before the
   game screen exists (returns silently). */
function renderBoosterBar(){
  const bar = document.getElementById("booster-bar");
  if(!bar) return;
  bar.innerHTML = "";
  BOOSTERS.forEach(b => {
    const slot = document.createElement("button");
    slot.type = "button";
    const count = getBoosterCount(b.id);
    const owned = count > 0;
    slot.className = "booster-slot" + (owned ? " owned" : " empty") + (armed === b.id ? " armed" : "");
    slot.style.setProperty("--slot-accent", b.accent);
    slot.dataset.boost = b.id;
    const nameI18n = (typeof t === "function" ? t("boost." + b.id + ".name") : null) || b.id;
    slot.setAttribute("aria-label", nameI18n + " (" + count + ")");
    slot.title = nameI18n;
    slot.innerHTML =
      '<svg class="ic-svg"><use href="' + b.icon + '"/></svg>'
      + '<span class="booster-count">' + count + '</span>';
    slot.addEventListener("click", (e) => { e.preventDefault(); onBoosterSlotClick(b.id); });
    bar.appendChild(slot);
  });
  /* Reflect the armed state on the board/tray so the targeting
     UI (cursor + tray overlay) shows up immediately. */
  updateArmedClasses();
}

function updateArmedClasses(){
  const board = document.getElementById("board");
  const tray  = document.getElementById("tray");
  if(board){
    board.classList.toggle("armed", armed === "bomb" || armed === "lightning");
  }
  if(tray){
    tray.classList.toggle("armed-skip", armed === "skip");
  }
}

/* ---------- Slot click ---------- */
function onBoosterSlotClick(id){
  /* Tapping an armed slot a second time disarms (cancel). */
  if(armed === id){ armed = null; renderBoosterBar(); return; }

  const count = getBoosterCount(id);
  if(count <= 0){
    toast((typeof t === "function" ? t("boost.empty") : null) || "Buy one in the shop first", "warn");
    return;
  }

  if(id === "shuffle"){
    applyShuffle();
    return;
  }
  if(id === "hint"){
    applyHint();
    return;
  }
  /* Targeted boosters arm and wait for the next tap. */
  armed = id;
  renderBoosterBar();
  const msg = (id === "skip")
    ? ((typeof t === "function" ? t("boost.pick.piece") : null) || "Tap a piece in the tray")
    : ((typeof t === "function" ? t("boost.pick.cell")  : null) || "Tap a cell on the board");
  toast(msg, "info");
  try { sfx.modalOpen && sfx.modalOpen(); } catch {}
}

/* ---------- shuffle ---------- */
function applyShuffle(){
  if(!state || !state.run){ return; }
  if(!spendBooster("shuffle")) return;
  state.run.pieces = (typeof genPieces === "function") ? genPieces() : state.run.pieces;
  if(typeof renderTray === "function") renderTray();
  try { sfx.shopEquip && sfx.shopEquip(); } catch {}
  vibrate && vibrate(20);
  toast((typeof t === "function" ? t("boost.used", { name: t("boost.shuffle.name") }) : null) || "Shuffle used", "success");
  renderBoosterBar();
}

/* ---------- hint ---------- */
/* Brute-force scan of every (piece, rotation, position) combo.
   Picks the placement with the highest projected score
   (placedCells + linesCleared*BOARD_SIZE) and briefly green-
   washes the cells it would land on. We deliberately do NOT
   place the piece — the player still completes the move so the
   hint feels like advice, not autoplay. */
function applyHint(){
  if(!state || !state.run){ return; }
  const pieces = state.run.pieces || [];
  if(!pieces.some(Boolean)){
    toast((typeof t === "function" ? t("boost.empty") : null) || "Tray is empty", "warn");
    return;
  }
  const best = findBestPlacement();
  if(!best){
    toast((typeof t === "function" ? t("boost.empty") : null) || "Nothing fits", "warn");
    return;
  }
  if(!spendBooster("hint")) return;
  /* Highlight the cells where the suggested piece would sit. */
  if(typeof cellEls !== "undefined" && cellEls.length){
    for(const [r, c] of shapeCells(best.shape)){
      const R = best.br + r, C = best.bc + c;
      if(R < 0 || C < 0 || R >= BOARD_SIZE || C >= BOARD_SIZE) continue;
      const cell = cellEls[R][C];
      if(!cell) continue;
      cell.classList.add("boost-hint");
      /* Auto-strip after the CSS animation finishes so the next
         render isn't stuck with leftover .boost-hint cells. */
      setTimeout(() => cell.classList.remove("boost-hint"), 1700);
    }
  }
  try { sfx.coinUp && sfx.coinUp(); } catch {}
  vibrate && vibrate(15);
  toast((typeof t === "function" ? t("boost.used", { name: t("boost.hint.name") }) : null) || "Hint shown", "success");
  renderBoosterBar();
}

/* For every tray piece × every 90° rotation × every (r, c)
   anchor, score the resulting board state. Higher score = better
   suggestion. Returns { shape, br, bc, idx } or null. */
function findBestPlacement(){
  const pieces = state.run.pieces || [];
  let best = null;
  for(let i = 0; i < pieces.length; i++){
    const p = pieces[i];
    if(!p) continue;
    let shape = p.shape;
    for(let rot = 0; rot < 4; rot++){
      for(let r = 0; r <= BOARD_SIZE - shape.length; r++){
        for(let c = 0; c <= BOARD_SIZE - shape[0].length; c++){
          if(!canPlace(state.run.board, shape, r, c)) continue;
          const score = scorePlacement(shape, r, c);
          if(!best || score > best.score){
            best = { shape, br: r, bc: c, idx: i, score };
          }
        }
      }
      shape = rotateShape(shape);
    }
  }
  return best;
}

function scorePlacement(shape, br, bc){
  /* Simulate the placement on a scratch board so clearLines() can
     count line clears. We restore the board immediately after. */
  const board = state.run.board;
  const cells = shapeCells(shape);
  for(const [r, c] of cells) board[br + r][bc + c] = "#hint";
  const { rows, cols } = clearLines(board);
  /* clearLines() returns the cleared rows/cols but does NOT
     mutate the board, so no restore work is needed beyond
     un-marking the cells we just dropped. */
  for(const [r, c] of cells) board[br + r][bc + c] = null;
  const placed = cells.length;
  const lines  = rows.length + cols.length;
  /* Heavily favour line clears (each cleared line is worth ~10
     placed cells), then placement size. */
  return placed + lines * BOARD_SIZE;
}

/* ---------- bomb / lightning targeting ----------
   Capture-phase listener on the board so we run BEFORE the cell's
   own listeners (there aren't any today, but future-proof) and,
   crucially, before any potential drag handlers that might attach
   to the board itself. */
function _onBoardCapture(ev){
  if(!armed) return;
  if(armed !== "bomb" && armed !== "lightning") return;
  const cell = ev.target && ev.target.closest && ev.target.closest(".cell");
  if(!cell) return;
  const r = +cell.dataset.r;
  const c = +cell.dataset.c;
  if(!Number.isFinite(r) || !Number.isFinite(c)) return;
  ev.preventDefault();
  ev.stopImmediatePropagation();
  if(armed === "bomb")      consumeBomb(r, c);
  else                      consumeLightning(r, c);
}

function consumeBomb(r, c){
  if(!spendBooster("bomb")) return;
  const board = state.run.board;
  let n = 0;
  const hit = [];
  for(let dr = -1; dr <= 1; dr++) for(let dc = -1; dc <= 1; dc++){
    const R = r + dr, C = c + dc;
    if(R < 0 || C < 0 || R >= BOARD_SIZE || C >= BOARD_SIZE) continue;
    if(board[R][C]){
      hit.push([R, C]);
      board[R][C] = null;
      n++;
    }
  }
  applyBoosterClear(hit);
  armed = null;
  try { sfx.clear && sfx.clear(); } catch {}
  vibrate && vibrate([15, 25, 15]);
  toast((typeof t === "function" ? t("boost.used", { name: t("boost.bomb.name") }) : null) || "Bomb fired", "success");
  if(typeof renderBoard === "function") renderBoard();
  renderBoosterBar();
  /* Bomb may have cleared the deadlock state — recheck game over. */
  postBoosterGameOverCheck();
}

function consumeLightning(r, c){
  if(!spendBooster("lightning")) return;
  const board = state.run.board;
  const hit = [];
  for(let i = 0; i < BOARD_SIZE; i++){
    if(board[r][i]){ hit.push([r, i]); board[r][i] = null; }
    if(i !== r && board[i][c]){ hit.push([i, c]); board[i][c] = null; }
  }
  applyBoosterClear(hit);
  armed = null;
  try { sfx.clear && sfx.clear(); } catch {}
  vibrate && vibrate([15, 25, 15]);
  toast((typeof t === "function" ? t("boost.used", { name: t("boost.lightning.name") }) : null) || "Lightning fired", "success");
  if(typeof renderBoard === "function") renderBoard();
  renderBoosterBar();
  postBoosterGameOverCheck();
}

/* Light particle burst at the centre of the cleared cells so a
   booster strike feels like a real line clear. We reuse the
   existing fx.linePop helper rather than rolling a new effect. */
function applyBoosterClear(cells){
  if(!window.fx || !cells.length) return;
  if(typeof cellEls === "undefined" || !cellEls.length) return;
  let sx = 0, sy = 0, n = 0;
  for(const [r, c] of cells){
    const el = cellEls[r][c];
    if(!el) continue;
    const rect = el.getBoundingClientRect();
    sx += rect.left + rect.width / 2;
    sy += rect.top  + rect.height / 2;
    n++;
  }
  if(n && typeof fx.linePop === "function"){
    fx.linePop(sx / n, sy / n, 1);
  }
}

/* If a booster strike eliminated the last fits-anywhere problem,
   we don't need to do anything special — placePiece() handles
   game-over on the next placement. But if the strike happened on
   an empty tray (impossible today but future-proof) or cleared
   the board enough to retroactively unlock things, just refresh
   the HUD. */
function postBoosterGameOverCheck(){
  if(typeof updateHUD === "function") updateHUD();
}

/* ---------- skip targeting ---------- */
function _onTrayCapture(ev){
  if(armed !== "skip") return;
  const slot = ev.target && ev.target.closest && ev.target.closest(".piece");
  if(!slot) return;
  if(slot.classList.contains("empty")) return;
  /* Block the drag handlers (mousedown/touchstart) on the piece. */
  ev.preventDefault();
  ev.stopImmediatePropagation();
  const idx = +slot.dataset.idx;
  if(!Number.isFinite(idx)) return;
  if(!spendBooster("skip")) return;
  state.run.pieces[idx] = null;
  armed = null;
  try { sfx.click && sfx.click(); } catch {}
  vibrate && vibrate(15);
  toast((typeof t === "function" ? t("boost.used", { name: t("boost.skip.name") }) : null) || "Skipped", "success");
  if(typeof refillTrayIfEmpty === "function") refillTrayIfEmpty();
  if(typeof renderTray === "function") renderTray();
  renderBoosterBar();
}

/* ---------- One-time wiring ----------
   Called from main.js → init(). Attaches capture-phase listeners
   on the board and tray containers so the booster system can
   intercept clicks BEFORE the drag handlers fire. */
function initBoosters(){
  const board = document.getElementById("board");
  const tray  = document.getElementById("tray");
  if(board){
    /* mousedown / touchstart fire before click on every platform;
       game.js' drag handler is on mousedown so we must beat it. */
    board.addEventListener("mousedown",  _onBoardCapture, true);
    board.addEventListener("touchstart", _onBoardCapture, { capture:true, passive:false });
  }
  if(tray){
    tray.addEventListener("mousedown",  _onTrayCapture, true);
    tray.addEventListener("touchstart", _onTrayCapture, { capture:true, passive:false });
  }
  /* Esc cancels the armed state — handy on desktop. */
  document.addEventListener("keydown", (e) => {
    if(e.key === "Escape" && armed){ armed = null; renderBoosterBar(); }
  });
  renderBoosterBar();
}
