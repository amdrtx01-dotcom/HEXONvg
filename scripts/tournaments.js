/* ============================================================
   HEXON BETA — Tournaments
   ============================================================
   Lightweight admin-curated tournament list. Storage lives in the
   same JSONBlob bin as the leaderboard + activations, under the
   `tournaments` key, so a single GET pulls everything the menu
   needs. Schema:

     tournaments: [
       {
         id:          "tour-<random>",
         name:        "Friday rush",
         description: "Highest score wins · top 3 share the pot",
         startAt:     <ms epoch>,
         endAt:       <ms epoch>,
         prize:       50000,            // HEX
         createdBy:   "HX-AB3C4-DE5F6", // admin ID for audit
         createdAt:   <ms epoch>
       },
       ...
     ]

   Players see a read-only list of upcoming / active / ended
   tournaments. The admin sees an extra creation form and a delete
   button on each card. There is no in-app prize disbursement — the
   admin tops up the winner manually via the existing "Send HEX by
   ID" tool. Tournaments are purely informational.

   The bin is shared so we always do read-modify-write to preserve
   the `entries`, `codeUsage` and `grants` fields that the other
   modules own. Local cache in `state.tournaments` survives an
   offline boot so the player at least sees the last-known list.
   ============================================================ */
"use strict";

/* Network knobs. Tournaments rarely change, so we poll once on
   entry to the screen plus a slow background tick. */
const TOUR_POLL_MS    = 120_000;     // 2 min background refresh
const TOUR_TIMEOUT_MS = 8_000;
const TOUR_MAX        = 32;          // hard cap on the array

let _tourTimer = null;
let _tourFetchInFlight = false;

/* ---------- Helpers ---------- */
function _tourId(){
  /* Short, URL-safe identifier — collision risk is low enough for a
     handful of tournaments per week. */
  const a = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "tour-"; const r = new Uint32Array(8);
  if(crypto && crypto.getRandomValues) crypto.getRandomValues(r);
  else for(let i=0;i<8;i++) r[i] = Math.floor(Math.random()*0xffffffff);
  for(let i=0;i<8;i++) s += a[r[i] % a.length];
  return s;
}

function _tourFetch(url, init){
  const ctrl = new AbortController();
  const tm = setTimeout(() => ctrl.abort(), TOUR_TIMEOUT_MS);
  return fetch(url, Object.assign({ signal: ctrl.signal, cache: "no-store" }, init || {}))
    .then(res => {
      if(!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    })
    .finally(() => clearTimeout(tm));
}

/* Tournament status from the server clock. We avoid Date.now() drift
   complications by using the device clock directly — players don't
   gain anything by gaming this since prizes are paid by the admin. */
function tournamentStatus(t){
  const now = Date.now();
  if(!t || !Number.isFinite(t.startAt) || !Number.isFinite(t.endAt)) return "unknown";
  if(now < t.startAt) return "upcoming";
  if(now >= t.endAt)  return "ended";
  return "active";
}

/* Sort: active first (earliest end), then upcoming (earliest start),
   then ended (most recent end). Keeps the most relevant card on top. */
function _tourSort(arr){
  return (arr || []).slice().sort((a, b) => {
    const sa = tournamentStatus(a), sb = tournamentStatus(b);
    const rank = { active:0, upcoming:1, ended:2, unknown:3 };
    const r = (rank[sa]|0) - (rank[sb]|0);
    if(r !== 0) return r;
    if(sa === "ended")    return (b.endAt|0)   - (a.endAt|0);
    if(sa === "upcoming") return (a.startAt|0) - (b.startAt|0);
    return (a.endAt|0) - (b.endAt|0);
  });
}

/* ---------- Bin I/O ---------- */
async function fetchTournaments(){
  if(_tourFetchInFlight) return state.tournaments || [];
  _tourFetchInFlight = true;
  try {
    const bin = await _tourFetch(getSharedBlobUrl(), { method: "GET", headers: { "Accept": "application/json" } });
    const arr = (bin && Array.isArray(bin.tournaments)) ? bin.tournaments : [];
    state.tournaments = arr;
    requestSaveState();
    return arr;
  } catch {
    /* Stay quiet on the wire — the UI handles empty/offline. */
    return state.tournaments || [];
  } finally {
    _tourFetchInFlight = false;
  }
}

async function _tourPutBin(mutate){
  /* Read, mutate via the callback, write back. Caller's mutate(bin)
     should edit bin.tournaments in place and return nothing. */
  let bin;
  try { bin = await _tourFetch(getSharedBlobUrl(), { method: "GET" }); }
  catch { throw new Error("offline"); }
  if(!bin || typeof bin !== "object") bin = {};
  if(!Array.isArray(bin.tournaments)) bin.tournaments = [];
  mutate(bin);
  if(bin.tournaments.length > TOUR_MAX){
    /* Trim oldest ended tournaments first. */
    const now = Date.now();
    bin.tournaments = _tourSort(bin.tournaments).slice(0, TOUR_MAX);
  }
  const body = Object.assign({}, bin, { version: 1, updatedAt: Date.now() });
  try {
    await _tourFetch(getSharedBlobUrl(), {
      method:  "PUT",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(body),
    });
  } catch { throw new Error("offline"); }
  state.tournaments = body.tournaments;
  requestSaveState();
  return body.tournaments;
}

async function createTournament(form){
  /* `form` carries { name, description, startAt, endAt, prize }.
     We validate aggressively before going to the network so a bad
     form never wastes a PUT. */
  const name  = String(form.name        || "").trim().slice(0, 80);
  const desc  = String(form.description || "").trim().slice(0, 500);
  const start = Number(form.startAt) || 0;
  const end   = Number(form.endAt)   || 0;
  const prize = Math.max(0, Math.floor(Number(form.prize) || 0));
  if(!name) throw new Error("name");
  if(!start || !end || end <= start) throw new Error("dates");
  if(end - start > 365 * 24 * 3600_000) throw new Error("too-long");

  const me = (state.profile && state.profile.id) || "";
  const entry = {
    id:          _tourId(),
    name, description: desc,
    startAt:     start,
    endAt:       end,
    prize,
    createdBy:   me,
    createdAt:   Date.now(),
  };
  await _tourPutBin(bin => bin.tournaments.unshift(entry));
  return entry;
}

async function deleteTournament(id){
  await _tourPutBin(bin => {
    bin.tournaments = bin.tournaments.filter(t => t && t.id !== id);
  });
}

/* ---------- Rendering ---------- */
function _tourFmtDateTime(ms){
  if(!Number.isFinite(ms) || ms <= 0) return "—";
  const d = new Date(ms);
  const pad = n => (n < 10 ? "0" : "") + n;
  return pad(d.getDate()) + "." + pad(d.getMonth()+1) + "." + d.getFullYear()
       + " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
}

function _tourFmtCountdown(ms){
  /* Compact "in 2d 5h" / "in 12m" string with i18n where available. */
  if(!Number.isFinite(ms) || ms <= 0) return "—";
  const diff = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(diff / 86400);
  const h = Math.floor((diff % 86400) / 3600);
  const m = Math.floor((diff % 3600) / 60);
  if(d > 0) return d + "д " + h + "г";
  if(h > 0) return h + "г " + m + "хв";
  return Math.max(1, m) + "хв";
}

function renderTournaments(){
  const screen = document.querySelector('[data-screen="tournaments"]');
  if(!screen) return;
  const list = screen.querySelector("#tour-list");
  const adm  = screen.querySelector("#tour-admin-form");
  if(adm){
    const showAdm = (typeof isAdminUser === "function") && isAdminUser();
    adm.classList.toggle("hidden", !showAdm);
    if(showAdm) wireTournamentAdminForm();
  }
  _renderTournamentList(list);
  /* Kick a background fetch so cards refresh on entry. */
  fetchTournaments().then(() => _renderTournamentList(list));
}

function _renderTournamentList(list){
  if(!list) return;
  list.innerHTML = "";
  const arr = _tourSort(state.tournaments || []);
  if(arr.length === 0){
    const empty = document.createElement("div");
    empty.className = "tour-empty";
    empty.textContent = (typeof t === "function" ? t("tour.empty") : null)
      || "Немає турнірів на горизонті — завітайте пізніше.";
    list.appendChild(empty);
    return;
  }
  arr.forEach(item => list.appendChild(_buildTournamentCard(item)));
}

function _buildTournamentCard(item){
  /* Card structure matches styles/tournaments.css — `is-{status}`
     classes drive the left stripe colour and the badge styling. */
  const status = tournamentStatus(item);
  const card = document.createElement("div");
  card.className = "tour-card is-" + status;

  const head = document.createElement("div");
  head.className = "tour-card-head";
  const name = document.createElement("div");
  name.className = "tour-card-name";
  name.textContent = item.name || "—";
  const badge = document.createElement("span");
  badge.className = "tour-card-badge";
  badge.textContent = (typeof t === "function" ? t("tour.status." + status) : null)
    || ({ active:"Live", upcoming:"Soon", ended:"Ended", unknown:"—" }[status]);
  head.appendChild(name);
  head.appendChild(badge);
  card.appendChild(head);

  if(item.description){
    const desc = document.createElement("p");
    desc.className = "tour-card-desc";
    desc.textContent = item.description;
    card.appendChild(desc);
  }

  const meta = document.createElement("div");
  meta.className = "tour-card-meta";
  const row = (icon, label, value, extraClass) => {
    const r = document.createElement("div");
    r.className = "meta" + (extraClass ? " " + extraClass : "");
    r.innerHTML = '<svg class="ic-svg"><use href="' + icon + '"/></svg>'
                + '<span>' + label + '</span>'
                + '<b>' + value + '</b>';
    return r;
  };
  meta.appendChild(row("#i-calendar",
    (typeof t === "function" ? t("tour.start") : null) || "Start",
    _tourFmtDateTime(item.startAt)));
  meta.appendChild(row("#i-calendar",
    (typeof t === "function" ? t("tour.end") : null) || "End",
    _tourFmtDateTime(item.endAt)));
  if(item.prize > 0){
    meta.appendChild(row("#i-coin",
      (typeof t === "function" ? t("tour.prize") : null) || "Prize",
      (item.prize|0).toLocaleString("uk-UA") + " HEX",
      "tour-card-prize"));
  }
  if(status === "upcoming"){
    meta.appendChild(row("#i-clock",
      (typeof t === "function" ? t("tour.until.start") : null) || "Starts in",
      _tourFmtCountdown(item.startAt - Date.now())));
  } else if(status === "active"){
    meta.appendChild(row("#i-clock",
      (typeof t === "function" ? t("tour.until.end") : null) || "Ends in",
      _tourFmtCountdown(item.endAt - Date.now())));
  }
  card.appendChild(meta);

  /* Admin gets a delete button per card. We confirm first so a misclick
     in the menu doesn't nuke a tournament. */
  if(typeof isAdminUser === "function" && isAdminUser()){
    const actions = document.createElement("div");
    actions.className = "tour-card-actions";
    const del = document.createElement("button");
    del.className = "btn-del";
    del.innerHTML = '<svg class="ic-svg"><use href="#i-trash"/></svg><span>'
                  + ((typeof t === "function" ? t("tour.delete") : null) || "Delete")
                  + '</span>';
    del.addEventListener("click", async () => {
      const ok = (typeof confirm === "function") ? confirm(
        ((typeof t === "function" ? t("tour.delete.confirm") : null)
         || "Delete tournament?") + "\n\n" + (item.name || "")
      ) : true;
      if(!ok) return;
      del.disabled = true;
      try {
        await deleteTournament(item.id);
        if(typeof toast === "function") toast(
          (typeof t === "function" ? t("tour.deleted") : null) || "Tournament deleted",
          "success");
        renderTournaments();
      } catch {
        if(typeof toast === "function") toast(
          (typeof t === "function" ? t("tour.err.offline") : null) || "Offline",
          "error");
        del.disabled = false;
      }
    });
    actions.appendChild(del);
    card.appendChild(actions);
  }
  return card;
}

/* ---------- Admin create form wiring ----------
   Input IDs match the HTML in index.html: #tour-name, #tour-desc,
   #tour-start, #tour-end, #tour-prize. Wiring is idempotent so we can
   re-call this safely on every screen entry. */
function wireTournamentAdminForm(){
  const form = document.getElementById("tour-admin-form");
  if(!form || form.dataset.wired === "1") return;
  form.dataset.wired = "1";
  const btn = form.querySelector("#tour-create-btn");
  if(!btn) return;
  btn.addEventListener("click", async () => {
    const name  = (form.querySelector("#tour-name")  || {}).value || "";
    const desc  = (form.querySelector("#tour-desc")  || {}).value || "";
    const start = (form.querySelector("#tour-start") || {}).value || "";
    const end   = (form.querySelector("#tour-end")   || {}).value || "";
    const prize = (form.querySelector("#tour-prize") || {}).value || "0";

    /* <input type="datetime-local"> gives us a local-zone string like
       "2026-05-30T18:00" — `new Date()` parses it in the player's TZ,
       which is what we want (admin schedules in their own time). */
    const startAt = start ? new Date(start).getTime() : 0;
    const endAt   = end   ? new Date(end).getTime()   : 0;
    btn.disabled = true;
    try {
      await createTournament({
        name, description: desc,
        startAt, endAt,
        prize: Number(prize) || 0,
      });
      if(typeof toast === "function") toast(
        (typeof t === "function" ? t("tour.created") : null) || "Tournament created",
        "success");
      /* Reset the form so the admin can queue another one right away. */
      ["#tour-name","#tour-desc","#tour-start","#tour-end","#tour-prize"]
        .forEach(sel => { const el = form.querySelector(sel); if(el) el.value = ""; });
      renderTournaments();
    } catch (e) {
      const reason = (e && e.message) || "";
      const map = {
        "name":     "tour.err.name",
        "dates":    "tour.err.dates",
        "too-long": "tour.err.too-long",
        "offline":  "tour.err.offline",
      };
      const key = map[reason] || "tour.err.generic";
      const msg = (typeof t === "function" ? t(key) : null)
        || ({ "name":"Enter a tournament name",
              "dates":"Invalid dates",
              "too-long":"Duration cannot exceed a year",
              "offline":"Offline" }[reason] || "Error");
      if(typeof toast === "function") toast(msg, "error");
    } finally {
      btn.disabled = false;
    }
  });
}

/* ---------- Polling ---------- */
function startTournamentPolling(){
  if(_tourTimer) clearInterval(_tourTimer);
  fetchTournaments().then(() => {
    if(typeof currentScreen !== "undefined" && currentScreen === "tournaments"){
      _renderTournamentList(document.getElementById("tour-list"));
    }
  });
  _tourTimer = setInterval(() => {
    if(typeof document !== "undefined" && document.hidden) return;
    fetchTournaments().then(() => {
      if(typeof currentScreen !== "undefined" && currentScreen === "tournaments"){
        _renderTournamentList(document.getElementById("tour-list"));
      }
    });
  }, TOUR_POLL_MS);
}
function stopTournamentPolling(){
  if(_tourTimer){ clearInterval(_tourTimer); _tourTimer = null; }
}
