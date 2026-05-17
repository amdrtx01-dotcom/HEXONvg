/* ---------- Game model ---------- */
const BOARD_SIZE = 10;
const PALETTE = [
  "#7c5cff","#24bdff","#3ddc97","#ffb454","#ff6470",
  "#a766ff","#22d3ee","#facc15","#f472b6","#34d399",
  "#fb7185","#fbbf24","#10b981","#06b6d4","#8b5cf6"
];
/* Polyomino shapes (Block Blast style) — 50+ unique figures */
const SHAPES = [
  // singles & lines
  [[1]],
  [[1,1]], [[1],[1]],
  [[1,1,1]], [[1],[1],[1]],
  [[1,1,1,1]], [[1],[1],[1],[1]],
  [[1,1,1,1,1]], [[1],[1],[1],[1],[1]],
  // squares & rectangles
  [[1,1],[1,1]],
  [[1,1,1],[1,1,1],[1,1,1]],
  [[1,1,1],[1,1,1]], [[1,1],[1,1],[1,1]],
  // L (small)
  [[1,0],[1,1]], [[0,1],[1,1]], [[1,1],[1,0]], [[1,1],[0,1]],
  // L big
  [[1,0],[1,0],[1,1]], [[0,1],[0,1],[1,1]], [[1,1],[1,0],[1,0]], [[1,1],[0,1],[0,1]],
  [[1,1,1],[1,0,0]], [[1,1,1],[0,0,1]], [[1,0,0],[1,1,1]], [[0,0,1],[1,1,1]],
  // T
  [[1,1,1],[0,1,0]], [[0,1,0],[1,1,1]], [[1,0],[1,1],[1,0]], [[0,1],[1,1],[0,1]],
  // S / Z
  [[1,1,0],[0,1,1]], [[0,1,1],[1,1,0]],
  [[1,0],[1,1],[0,1]], [[0,1],[1,1],[1,0]],
  // Plus / cross
  [[0,1,0],[1,1,1],[0,1,0]],
  // U-shape (3 wide)
  [[1,0,1],[1,1,1]],
  [[1,1,1],[1,0,1]],
  [[1,1],[1,0],[1,1]],
  [[1,1],[0,1],[1,1]],
  // Big L (5-block)
  [[1,0,0],[1,0,0],[1,1,1]],
  [[0,0,1],[0,0,1],[1,1,1]],
  [[1,1,1],[1,0,0],[1,0,0]],
  [[1,1,1],[0,0,1],[0,0,1]],
  // Big T (5-block)
  [[1,1,1,1,1],[0,0,1,0,0]],
  [[0,0,1,0,0],[1,1,1,1,1]],
  // Zig-zag (S/Z 5-block)
  [[1,1,0,0],[0,1,1,1]],
  [[0,0,1,1],[1,1,1,0]],
  [[1,1,0],[0,1,0],[0,1,1]],
  [[0,1,1],[0,1,0],[1,1,0]],
  // Corner / arrow
  [[1,1,1],[1,1,0],[1,0,0]],
  [[1,1,1],[0,1,1],[0,0,1]],
  [[1,0,0],[1,1,0],[1,1,1]],
  [[0,0,1],[0,1,1],[1,1,1]],
  // Hexagon-ish (offset squares)
  [[1,1,0],[1,1,1],[0,1,1]],
  [[0,1,1],[1,1,1],[1,1,0]],
  // P-pentomino
  [[1,1],[1,1],[1,0]],
  [[1,1],[1,1],[0,1]],
  [[1,0],[1,1],[1,1]],
  [[0,1],[1,1],[1,1]],
  // Y-pentomino
  [[0,1],[1,1],[0,1],[0,1]],
  [[1,0],[1,1],[1,0],[1,0]],
  // Big plus (5-tall)
  [[0,1,0],[0,1,0],[1,1,1],[0,1,0],[0,1,0]],
  // Stairs (5-block)
  [[1,0,0],[1,1,0],[0,1,1]],
  [[0,0,1],[0,1,1],[1,1,0]],
  // Lightning bolt
  [[0,1,1],[1,1,0],[1,0,0]],
  [[1,1,0],[0,1,1],[0,0,1]],
];

function newBoard(){
  return Array.from({length:BOARD_SIZE}, ()=>Array(BOARD_SIZE).fill(null));
}
function newRun(){
  return {
    board: newBoard(),
    score: 0,
    lines: 0,
    combo: 1,
    streak: 0,
    placedThisRun: 0,
    clearsThisRun: 0,
    startedAt: Date.now(),
    pieces: [], // {shape, color, id}
    lastClearMoveAgo: -1, // for streak
    movesSinceClear: 0,
  };
}
function shapeCells(shape){
  const out = [];
  for(let r=0;r<shape.length;r++) for(let c=0;c<shape[0].length;c++) if(shape[r][c]) out.push([r,c]);
  return out;
}
function shapeSize(shape){
  return shape.reduce((s,row)=>s+row.reduce((a,b)=>a+b,0),0);
}
function canPlace(board, shape, br, bc){
  for(const [r,c] of shapeCells(shape)){
    const R = br+r, C = bc+c;
    if(R<0||C<0||R>=BOARD_SIZE||C>=BOARD_SIZE) return false;
    if(board[R][C]) return false;
  }
  return true;
}
function canPlaceAnywhere(board, shape){
  for(let r=0;r<BOARD_SIZE;r++) for(let c=0;c<BOARD_SIZE;c++) if(canPlace(board, shape, r, c)) return true;
  return false;
}
function place(board, shape, br, bc, color){
  for(const [r,c] of shapeCells(shape)) board[br+r][bc+c] = color;
}
function clearLines(board){
  const rows = [], cols = [];
  for(let r=0;r<BOARD_SIZE;r++){
    let full = true;
    for(let c=0;c<BOARD_SIZE;c++) if(!board[r][c]){ full=false; break; }
    if(full) rows.push(r);
  }
  for(let c=0;c<BOARD_SIZE;c++){
    let full = true;
    for(let r=0;r<BOARD_SIZE;r++) if(!board[r][c]){ full=false; break; }
    if(full) cols.push(c);
  }
  const cells = new Set();
  rows.forEach(r=>{ for(let c=0;c<BOARD_SIZE;c++) cells.add(r*BOARD_SIZE+c); });
  cols.forEach(c=>{ for(let r=0;r<BOARD_SIZE;r++) cells.add(r*BOARD_SIZE+c); });
  return { rows, cols, cells };
}

/* rotate a 2D shape 90 degrees clockwise */
function rotateShape(shape){
  const rows = shape.length, cols = shape[0].length;
  const out = Array.from({length: cols}, () => Array(rows).fill(0));
  for(let r=0;r<rows;r++) for(let c=0;c<cols;c++){
    out[c][rows-1-r] = shape[r][c];
  }
  // trim empty rows/cols just in case (shapes are already tight, but be safe)
  return out;
}

/* generate a tray of 3 pieces. The colour palette comes from the
   currently equipped skin (skins.js), falling back to the default
   PALETTE so the game still runs if skins.js failed to load. */
function genPieces(){
  const palette = (typeof currentPalette === "function") ? currentPalette() : PALETTE;
  const pieces = [];
  for(let i=0;i<3;i++){
    const shape = SHAPES[Math.floor(Math.random()*SHAPES.length)];
    const color = palette[Math.floor(Math.random()*palette.length)];
    pieces.push({ shape, color, id: "p"+Date.now()+"_"+i+"_"+Math.random().toString(36).slice(2,6), used:false });
  }
  return pieces;
}

/* ---------- DOM render ---------- */
let boardEl, trayEl;
const cellEls = []; // 2D
/* Track which cells are currently painted as "ghost" so paintGhost()
   only needs to scrub those instead of looping all 100 cells on every
   pointer move. Hot path during drag — keeps the input → repaint loop
   under a single rAF tick on phones. */
const ghostCells = [];

function buildBoardDom(){
  boardEl = $("#board");
  boardEl.innerHTML = "";
  cellEls.length = 0;
  ghostCells.length = 0;
  const frag = document.createDocumentFragment();
  for(let r=0;r<BOARD_SIZE;r++){
    const row = [];
    for(let c=0;c<BOARD_SIZE;c++){
      const cell = document.createElement("div");
      cell.className = "cell";
      cell.dataset.r = r; cell.dataset.c = c;
      frag.appendChild(cell);
      row.push(cell);
    }
    cellEls.push(row);
  }
  boardEl.appendChild(frag);
}
function renderBoard(){
  /* Touch only the cells that actually changed since the last frame.
     Going from "clear board state in JS" → "DOM mutation per cell"
     was the single hottest path while dragging pieces; skipping
     no-op classList writes cuts layout work by ~3× on phones. */
  for(let r=0;r<BOARD_SIZE;r++){
    const rowEls = cellEls[r];
    const rowState = state.run.board[r];
    for(let c=0;c<BOARD_SIZE;c++){
      const cell = rowEls[c];
      const v = rowState[c];
      const cl = cell.classList;
      if(cl.contains("ghost"))     cl.remove("ghost");
      if(cl.contains("ghost-bad")) cl.remove("ghost-bad");
      if(v){
        if(!cl.contains("filled")){
          cl.add("filled","pop");
          /* The .pop animation auto-detaches via animationend so we
             don't pile up timers when the board churns quickly. */
          cell.addEventListener("animationend", _stripPop, { once: true });
        }
        if(cl.contains("clearing")) cl.remove("clearing");
        if(cell.style.getPropertyValue("--cell-color") !== v){
          cell.style.setProperty("--cell-color", v);
        }
      } else {
        if(cl.contains("filled"))   cl.remove("filled");
        if(cl.contains("clearing")) cl.remove("clearing");
        if(cell.style.getPropertyValue("--cell-color")){
          cell.style.removeProperty("--cell-color");
        }
      }
    }
  }
  ghostCells.length = 0;
}
function _stripPop(ev){
  if(ev && ev.currentTarget) ev.currentTarget.classList.remove("pop");
}
function clearGhost(){
  /* Scrub only the cells we know we painted last time. Avoids the
     100-cell scan that the old implementation ran on every pointer
     move during drag. */
  for(const cell of ghostCells){
    const cl = cell.classList;
    if(cl.contains("ghost"))     cl.remove("ghost");
    if(cl.contains("ghost-bad")) cl.remove("ghost-bad");
  }
  ghostCells.length = 0;
}
function paintGhost(shape, br, bc, color, bad){
  clearGhost();
  const klass = bad ? "ghost-bad" : "ghost";
  for(const [r,c] of shapeCells(shape)){
    const R = br+r, C = bc+c;
    if(R<0||C<0||R>=BOARD_SIZE||C>=BOARD_SIZE) continue;
    const cell = cellEls[R][C];
    cell.classList.add(klass);
    ghostCells.push(cell);
  }
}

function pieceSwatch(piece){
  /* Render a static preview of the piece in the tray slot.
     Long shapes (e.g. 1xN bars) would overflow a fixed 18px cell size,
     so we scale cells down based on the longest side of the shape.
     This keeps every piece bounded inside its slot regardless of
     orientation while still keeping small pieces readable. */
  const wrap = document.createElement("div");
  wrap.className = "piece-grid";
  const W = piece.shape[0].length;
  const H = piece.shape.length;
  const longest = Math.max(W, H);
  const cellPx =
    longest <= 3 ? 18 :
    longest <= 4 ? 15 :
    longest <= 5 ? 13 :
    /* 6+ */      11;
  wrap.style.setProperty("--piece-cell-px", cellPx + "px");
  wrap.style.gridTemplateColumns = "repeat("+W+",var(--piece-cell-px))";
  for(let r=0;r<H;r++) for(let c=0;c<W;c++){
    const cell = document.createElement("div");
    cell.className = "piece-cell" + (piece.shape[r][c] ? "" : " gap");
    cell.style.setProperty("--cell-color", piece.color);
    wrap.appendChild(cell);
  }
  return wrap;
}

function renderTray(){
  trayEl = $("#tray");
  trayEl.innerHTML = "";
  state.run.pieces.forEach((p, idx)=>{
    const slot = document.createElement("div");
    slot.className = "piece";
    if(!p){
      slot.classList.add("empty");
      trayEl.appendChild(slot);
      return;
    }
    slot.dataset.idx = idx;

    // visible swatch
    const swatch = pieceSwatch(p);
    slot.appendChild(swatch);

    // rotate handle
    const rotateBtn = document.createElement("button");
    rotateBtn.type = "button";
    rotateBtn.className = "piece-rotate";
    rotateBtn.setAttribute("aria-label", "rotate");
    rotateBtn.title = t("play.rotate") || "Rotate";
    rotateBtn.innerHTML = '<svg class="ic-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/></svg>';
    rotateBtn.addEventListener("click", (e)=>{ e.stopPropagation(); rotatePiece(idx); });
    rotateBtn.addEventListener("mousedown", (e)=> e.stopPropagation());
    rotateBtn.addEventListener("touchstart", (e)=> e.stopPropagation(), {passive:true});
    slot.appendChild(rotateBtn);

    // right-click on the slot also rotates (desktop convenience)
    slot.addEventListener("contextmenu", (e)=>{ e.preventDefault(); rotatePiece(idx); });

    // mark dead if cannot place in any rotation
    if(!canPlaceAnywhereAnyRotation(state.run.board, p.shape)) slot.classList.add("dead");
    attachDrag(slot, p, idx);
    trayEl.appendChild(slot);
  });
}

/* check if any rotation can fit somewhere */
function canPlaceAnywhereAnyRotation(board, shape){
  let s = shape;
  for(let i=0;i<4;i++){
    if(canPlaceAnywhere(board, s)) return true;
    s = rotateShape(s);
  }
  return false;
}

function rotatePiece(idx){
  const p = state.run && state.run.pieces[idx];
  if(!p) return;
  p.shape = rotateShape(p.shape);
  sfx.click();
  vibrate(8);
  renderTray();
  /* Coalesced: rapid double/triple rotation no longer triggers a
     separate disk write per click; only the last shape is persisted. */
  requestSaveState();
}

/* ---------- Drag & drop (mouse + touch) ---------- */
const dragLayer = ()=> $("#drag-layer");
let dragData = null;
/* During a drag we hit boardMetrics() once per rAF tick, which used
   to mean a synchronous getBoundingClientRect() — i.e. a forced layout
   on every pointer move. On a busy board this was a measurable chunk
   of the per-frame budget on mid-range phones. We snapshot the rect
   once at drag start (board geometry can't change mid-drag) and serve
   it from this cache; the live function is still exported so callers
   outside a drag (e.g. pieceCellPx() before dragData exists) keep
   working the same way. */
let _boardMetricsCache = null;
function boardMetrics(){
  if(_boardMetricsCache) return _boardMetricsCache;
  const rect = boardEl.getBoundingClientRect();
  const padding = 6, gap = 3;
  const cw = (rect.width - padding*2 - (BOARD_SIZE-1)*gap) / BOARD_SIZE;
  return { rect, padding, gap, cw };
}
function _primeBoardMetricsCache(){
  _boardMetricsCache = null;
  _boardMetricsCache = boardMetrics();
}
function _clearBoardMetricsCache(){
  _boardMetricsCache = null;
}
/* If the viewport resizes (rotation, address-bar collapse, browser
   resize) the cached rect is stale — drop it so the next read goes
   back to getBoundingClientRect(). */
window.addEventListener("resize", _clearBoardMetricsCache);
window.addEventListener("orientationchange", _clearBoardMetricsCache);
function pieceCellPx(){
  return boardMetrics().cw;
}
function makeFloatPiece(piece, sizePx){
  const fl = document.createElement("div");
  fl.className = "float-piece";
  fl.style.gridTemplateColumns = "repeat("+piece.shape[0].length+",1fr)";
  fl.style.setProperty("--c", sizePx+"px");
  for(let r=0;r<piece.shape.length;r++) for(let c=0;c<piece.shape[0].length;c++){
    const cell = document.createElement("div");
    cell.className = "pc" + (piece.shape[r][c] ? "" : " gap");
    cell.style.setProperty("--cell-color", piece.color);
    fl.appendChild(cell);
  }
  return fl;
}
function attachDrag(el, piece, idx){
  const onDown = (ev)=>{
    if(state.run.pieces[idx] !== piece) return;
    ev.preventDefault();
    /* Prime the metrics cache so every subsequent pointermove during
       this drag avoids a fresh getBoundingClientRect() / forced layout. */
    _primeBoardMetricsCache();
    const point = ev.touches ? ev.touches[0] : ev;
    const sizePx = pieceCellPx();
    const float = makeFloatPiece(piece, sizePx);
    dragLayer().appendChild(float);
    el.classList.add("dragging");
    dragData = {
      piece, idx, float, sizePx,
      // Anchor: the touch/click point sits on the "first filled" cell row/col
      anchorR: 0, anchorC: 0,
      lastValid:null,
    };
    // pick anchor: first filled cell in shape
    outer: for(let r=0;r<piece.shape.length;r++) for(let c=0;c<piece.shape[0].length;c++) if(piece.shape[r][c]){ dragData.anchorR = r; dragData.anchorC = c; break outer; }
    moveFloat(point.clientX, point.clientY);
    updateGhost(point.clientX, point.clientY);
    document.addEventListener("mousemove", onMove);
    document.addEventListener("touchmove", onMove, {passive:false});
    document.addEventListener("mouseup", onUp);
    document.addEventListener("touchend", onUp);
    document.addEventListener("touchcancel", onUp);
  };
  el.addEventListener("mousedown", onDown);
  el.addEventListener("touchstart", onDown, {passive:false});
}
function dragLift(){
  // lift the float piece a bit above the cursor so the ghost preview is
  // visible on the board cells underneath. Bigger lift on touch devices.
  return window.matchMedia("(hover: none)").matches || window.innerWidth < 720 ? 64 : 28;
}
function moveFloat(x,y){
  if(!dragData) return;
  const { float, sizePx, anchorR, anchorC } = dragData;
  const lift = dragLift();
  const stride = sizePx + 3;
  const left = x - (anchorC + 0.5) * stride;
  const top  = y - lift - (anchorR + 0.5) * stride;
  float.style.left = left + "px";
  float.style.top  = top + "px";
}
function pointToBoardCell(x,y){
  if(!boardEl) return null;
  const { rect, padding, gap, cw } = boardMetrics();
  const stride = cw + gap;
  const localX = x - rect.left - padding;
  const localY = y - rect.top - padding;
  const innerSize = rect.width - padding*2;
  if(localX < -stride || localX > innerSize + stride || localY < -stride || localY > innerSize + stride) return null;
  const c = Math.floor(localX / stride);
  const r = Math.floor(localY / stride);
  return { r, c };
}
function updateGhost(x, y){
  if(!dragData) return;
  const { piece, anchorR, anchorC } = dragData;
  const lift = dragLift();
  const adjY = y - lift;
  const cell = pointToBoardCell(x, adjY);
  if(!cell){ clearGhost(); dragData.lastValid = null; return; }
  const br = cell.r - anchorR;
  const bc = cell.c - anchorC;
  const ok = canPlace(state.run.board, piece.shape, br, bc);
  paintGhost(piece.shape, br, bc, piece.color, !ok);
  dragData.lastValid = ok ? { br, bc } : null;
}
/* rAF-throttled pointer follow.
   Touch and mouse events can fire faster than the screen redraws,
   especially during a brisk drag — coalescing them into one paint
   per animation frame is what keeps the ghost preview from chasing
   the finger on mid-range phones. The latest coordinates always win;
   stale ones in between are simply dropped. */
let _dragRaf = 0;
let _dragPendingX = 0;
let _dragPendingY = 0;
function _flushDrag(){
  _dragRaf = 0;
  if(!dragData) return;
  moveFloat(_dragPendingX, _dragPendingY);
  updateGhost(_dragPendingX, _dragPendingY);
}
function onMove(ev){
  if(!dragData) return;
  ev.preventDefault();
  const point = ev.touches ? ev.touches[0] : ev;
  _dragPendingX = point.clientX;
  _dragPendingY = point.clientY;
  if(!_dragRaf) _dragRaf = requestAnimationFrame(_flushDrag);
}
function onUp(ev){
  if(!dragData) return;
  document.removeEventListener("mousemove", onMove);
  document.removeEventListener("touchmove", onMove);
  document.removeEventListener("mouseup", onUp);
  document.removeEventListener("touchend", onUp);
  document.removeEventListener("touchcancel", onUp);
  if(_dragRaf){ cancelAnimationFrame(_dragRaf); _dragRaf = 0; }
  const { piece, idx, float, lastValid } = dragData;
  float.remove();
  const slot = trayEl.querySelector('[data-idx="'+idx+'"]');
  if(slot) slot.classList.remove("dragging");
  clearGhost();
  if(lastValid){
    placePiece(idx, lastValid.br, lastValid.bc);
  }
  dragData = null;
  /* Drag's over — placePiece() ran renderBoard() which may have
     changed the board's box size (line clears resize nothing today,
     but a future tray collapse could). Drop the cache so the next
     drag re-reads. */
  _clearBoardMetricsCache();
}

/* ---------- Game flow ---------- */
function startGame(){
  state.run = newRun();
  state.run.pieces = genPieces();
  renderBoard();
  renderTray();
  updateHUD();
  refreshSideTasks();
  /* Booster slot counts persist across runs, so the bar's content
     doesn't reset here — but a fresh DOM (after buildBoardDom) needs
     to be repainted so the slots get re-attached on the game
     screen. Safe no-op if boosts.js hasn't loaded yet. */
  if(typeof renderBoosterBar === "function") renderBoosterBar();
}
function refillTrayIfEmpty(){
  if(state.run.pieces.every(p=>!p)){
    state.run.pieces = genPieces();
  }
}
/* ---------- Scoring tunables ----------
   The user asked for "a bit more score per move". We're a casual
   puzzle game and the previous values were way too stingy
   (1 pt / cell, 100 / line). Bumped to 5×/8× of the old values
   so that the on-screen numbers feel rewarding without the
   game becoming trivially easy. */
const SCORE_PER_CELL_PLACED = 5;     // was: 1 — every placed cell pays 5pt
const SCORE_PER_LINE_MULT   = 80;    // base per cleared line (was: 10*BOARD_SIZE = 100; now: 800 per line)
const SCORE_MULTI_LINE_BONUS_BASE = 50;  // was: 10  — bonus when ≥2 lines clear
const SCORE_MULTI_LINE_BONUS_STEP = 40;  // was:  8  — extra per additional line

function placePiece(idx, br, bc){
  const piece = state.run.pieces[idx];
  if(!piece) return;
  if(!canPlace(state.run.board, piece.shape, br, bc)) return;
  // place
  place(state.run.board, piece.shape, br, bc, piece.color);
  const placedCells = shapeSize(piece.shape);
  state.run.score += placedCells * SCORE_PER_CELL_PLACED; // base points per cell
  state.run.placedThisRun += 1;
  state.stats.placedTotal = (state.stats.placedTotal||0) + 1;
  state.run.pieces[idx] = null;

  sfx.place();
  vibrate(15);
  // floating "+N" popup centered on the placed piece for instant feedback
  if(window.fx){
    const firstCell = cellEls[br][bc];
    if(firstCell){
      const r = firstCell.getBoundingClientRect();
      fx.scorePop(placedCells * SCORE_PER_CELL_PLACED, r.left + r.width/2, r.top - 4);
    }
  }

  // hidden: first place
  if(!state.hidden.firstPlace){ state.hidden.firstPlace = true; unlockAch("h_first_place", "ach.h.1.t","ach.h.1.d","i-rocket"); }

  // line clears
  const { rows, cols, cells } = clearLines(state.run.board);
  const linesCleared = rows.length + cols.length;
  if(linesCleared > 0){
    /* Remove cleared cells from the board model SYNCHRONOUSLY so the
       game-over check at the bottom of this function sees the
       post-clear board. The DOM animation is still deferred below,
       only the model is updated immediately. */
    cells.forEach(idx=>{
      const r = Math.floor(idx / BOARD_SIZE), c = idx % BOARD_SIZE;
      const cell = cellEls[r][c];
      cell.classList.add("clearing");
      state.run.board[r][c] = null;
    });
    sfx.clear();
    if(linesCleared >= 2) sfx.combo(linesCleared);
    vibrate([20, 30, 20]);
    // burst particles at the center of cleared rows/cols
    if(window.fx && cells.length){
      let sx = 0, sy = 0, n = 0;
      cells.forEach(idx => {
        const r = Math.floor(idx / BOARD_SIZE), c = idx % BOARD_SIZE;
        const el = cellEls[r][c];
        if(!el) return;
        const rect = el.getBoundingClientRect();
        sx += rect.left + rect.width/2;
        sy += rect.top  + rect.height/2;
        n++;
      });
      if(n){
        fx.linePop(sx/n, sy/n, linesCleared);
        if(linesCleared >= 3){
          fx.flash();
          fx.celebrateCombo(linesCleared, $("#board"));
        }
      }
    }

    state.run.combo = (state.run.combo||1);
    if(state.run.movesSinceClear === 0){
      // chained on consecutive clears (next placement also clears)
    }
    // multi-line in one move
    const multiBonus = linesCleared >= 2
      ? (SCORE_MULTI_LINE_BONUS_BASE + (linesCleared - 1) * SCORE_MULTI_LINE_BONUS_STEP)
      : 0;
    const baseLineScore = linesCleared * SCORE_PER_LINE_MULT * BOARD_SIZE; // 800 per line
    const combo = state.run.combo;
    state.run.score += Math.floor((baseLineScore + multiBonus) * combo);

    state.run.lines += linesCleared;
    state.stats.lines = (state.stats.lines||0) + linesCleared;

    state.run.clearsThisRun += 1;
    state.run.streak += 1;
    state.run.movesSinceClear = 0;
    // ramp combo
    state.run.combo = Math.min(8, state.run.combo + 1);
    if(state.run.combo > state.stats.bestCombo) state.stats.bestCombo = state.run.combo;

    // hidden achievements
    if(linesCleared >= 3 && !state.hidden.tripleClear){ state.hidden.tripleClear = true; unlockAch("h_triple", "ach.h.2.t","ach.h.2.d","i-flame"); }
    if(linesCleared >= 4 && !state.hidden.quadClear){ state.hidden.quadClear = true; unlockAch("h_quad", "ach.h.3.t","ach.h.3.d","i-flame"); }

    const runRef = state.run;
    setTimeout(()=>{
      // abort if the game was restarted in the meantime
      if(state.run !== runRef) return;
      // cells were already removed from the model above; just animate
      // out by re-rendering once the clearing class has played.
      renderBoard();
      // cleaner achievement
      const filled = state.run.board.flat().filter(Boolean).length;
      if(filled === 0 && state.run.maxFillHit >= 50 && !state.hidden.cleaner){
        state.hidden.cleaner = true; unlockAch("h_cleaner", "ach.h.8.t","ach.h.8.d","i-grid");
      }
    }, 380);

    // toast
    if(linesCleared > 1) toast(t("toast.lines",{n:linesCleared}) + " · " + t("toast.combo",{n:combo}), "success");
    else if(combo > 1) toast(t("toast.combo",{n:combo}), "success");
    else toast(t("toast.line"), "success");

    // task progress on clear3+
    if(linesCleared >= 3) bumpDailyTask("clear3", 1);
  } else {
    // missed: reset combo
    state.run.combo = 1;
    state.run.streak = 0;
    state.run.movesSinceClear += 1;
  }

  // XP grant
  const xpGain = placedCells + linesCleared*5;
  addXP(xpGain);

  // stats updates
  if(state.run.score > state.run.bestRun) state.run.bestRun = state.run.score;
  if(state.run.score > (state.stats.bestRun||0)) state.stats.bestRun = state.run.score;
  if(state.run.score > (state.stats.best||0)) state.stats.best = state.run.score;
  state.stats.totalScore = (state.stats.totalScore||0) + placedCells; // accumulate cell-placement contribution

  // max fill
  const filled = state.run.board.flat().filter(Boolean).length;
  state.run.maxFillHit = Math.max(state.run.maxFillHit||0, filled);

  // hidden survivor / pacifist
  if(state.run.placedThisRun === 50 && state.run.clearsThisRun === 0 && !state.hidden.pacifist){
    state.hidden.pacifist = true; unlockAch("h_pacifist","ach.h.6.t","ach.h.6.d","i-target");
  }
  if(state.run.placedThisRun === 200 && !state.hidden.survivor){
    state.hidden.survivor = true; unlockAch("h_survivor","ach.h.7.t","ach.h.7.d","i-target");
  }
  // speedrun: 500+ in 2 minutes
  if(state.run.score >= 500 && (Date.now() - state.run.startedAt) <= 120000 && !state.hidden.speedrun){
    state.hidden.speedrun = true; unlockAch("h_speedrun","ach.h.5.t","ach.h.5.d","i-bolt");
  }

  // daily tasks
  bumpDailyTask("place", 1);
  if(linesCleared > 0) bumpDailyTask("lines", linesCleared);
  if(state.run.combo > 1) bumpDailyTask("combo", state.run.combo, true);
  bumpDailyTask("score", state.run.score, true);

  // achievements checks
  evaluateAchievements();

  // refill tray
  refillTrayIfEmpty();
  renderBoard();
  renderTray();
  updateHUD();
  refreshSideTasks();
  /* Coalesce: this used to be a hard saveState() call that, combined
     with bumpDailyTask / evaluateAchievements / unlockAch above, could
     produce 4-7 sync disk writes in the same tick on a busy line
     clear. Now they all fold into one microtask write. */
  requestSaveState();

  // game over check
  if(!anyPieceFits()){
    setTimeout(endGame, 480);
  }
}

function anyPieceFits(){
  return state.run.pieces.some(p => p && canPlaceAnywhereAnyRotation(state.run.board, p.shape));
}

function endGame(){
  // commit run
  state.stats.games = (state.stats.games||0) + 1;
  state.stats.totalTimeMs = (state.stats.totalTimeMs||0) + (Date.now() - state.run.startedAt);
  /* Persist this run's score into the cross-run aggregate before the
     game-over modal is shown. Doing it here (instead of waiting for
     the modal button handler) prevents the average from being skewed
     when the user closes the tab mid-modal. */
  state.stats.totalScoreFromGames = (state.stats.totalScoreFromGames||0) + state.run.score;
  state.stats.totalScore = (state.stats.totalScore||0); // already accumulated
  if(state.run.score > state.stats.best) state.stats.best = state.run.score;

  bumpDailyTask("games", 1);
  evaluateAchievements();
  // leaderboards bump
  updateLeaderboardsForMe();

  // modal
  $("#m-score").textContent = state.run.score;
  $("#m-best").textContent = state.stats.best;
  $("#modal-gameover").classList.add("show");
  sfx.gameover();
  vibrate([30,60,30]);
  /* End-of-run is a real terminal checkpoint — flush synchronously so
     the high-score lands on disk before the player can close the tab
     from the modal. */
  flushSaveState();
}

