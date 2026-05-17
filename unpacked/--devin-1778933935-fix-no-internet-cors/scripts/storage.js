/* ---------- Storage ---------- */
const STORE_KEY = "hexon.beta.v1";
function loadState(){
  try{
    const raw = localStorage.getItem(STORE_KEY);
    if(!raw) return null;
    return JSON.parse(raw);
  }catch{ return null; }
}
/* Build the JSON-able snapshot of the live `state`. Shared by
   saveState (writes to localStorage) and the Android bridge
   (writes the same blob to Documents/HEXON/<nick>.json so the
   profile survives an uninstall). */
function buildStateSnapshot(){
  return {
    profile: state.profile,
    stats: state.stats,
    settings: state.settings,
    achievements: Array.from(state.achievements || []),
    hidden: state.hidden,
    dailyTasks: state.dailyTasks,
    leaderboards: state.leaderboards,
    wallet: state.wallet,
    skins:  state.skins,
    /* Booster inventory — the counts behind the in-game booster bar.
       Persisted alongside the wallet so purchases stick across runs. */
    boosts: state.boosts || { shuffle:0, bomb:0, lightning:0, hint:0, skip:0 },
    usedActivationCodes: state.usedActivationCodes || [],
    activationUsage: state.activationUsage || {},
    activations: state.activations || { redeemed: 0, totalReceived: 0, generated: 0 },
    /* Nonces of HEX-by-ID grants this device has already credited.
       Persisted so a reload-during-poll can't double-count. */
    claimedGrants: state.claimedGrants || [],
    run: null, // not persisted across reloads (live game state)
  };
}
function saveState(){
  try{
    const copy = buildStateSnapshot();
    localStorage.setItem(STORE_KEY, JSON.stringify(copy));
  }catch{}
  /* Mirror to disk on Android so the profile survives reinstall.
     Fire-and-forget; absence of the bridge / permission is fine. */
  try {
    if (typeof saveProfileToDisk === "function") saveProfileToDisk();
  } catch {}
}

/* Coalesced variant.
   A single piece placement touches ~6 things that each "want" a save:
   placePiece() itself, addXP() chained via task XP, every triggered
   hidden achievement, every triggered evaluateAchievements unlock,
   every bumpDailyTask invocation, and ensureDailyTasks() on day-roll.
   Calling saveState() inline at each of those points is what made the
   game stutter on mid-range Androids — every call does a full
   JSON.stringify of the state + localStorage write + a JNI roundtrip
   to the Java disk bridge. We coalesce all of them into a single
   write at the end of the current microtask, so the visible cost
   per move drops from O(unlocks) sync writes to exactly one.
   `flushSaveState()` is provided for the rare "must be on disk now"
   paths (game over, login, app pause). */
let _saveStateScheduled = false;
function requestSaveState(){
  if(_saveStateScheduled) return;
  _saveStateScheduled = true;
  /* Microtask, not setTimeout — runs at the end of the current call
     stack so the persisted blob already reflects every state mutation
     in this turn. queueMicrotask is universally supported in modern
     WebView, so no Promise.resolve() fallback needed. */
  queueMicrotask(() => {
    _saveStateScheduled = false;
    saveState();
  });
}
function flushSaveState(){
  /* If a microtask is already pending, just run the save synchronously
     and let the pending one no-op (the flag flip happens in the cb).
     Either way the caller is guaranteed a write before we return. */
  _saveStateScheduled = false;
  saveState();
}

/* The player ID is supposed to be permanent — even a hard reset of all
   game data should leave it intact. We mirror it to its own key so we
   can resurrect it after `localStorage.removeItem(STORE_KEY)`. */
const PLAYER_ID_KEY = "hexon.beta.playerId";
function loadPermanentPlayerId(){
  try { return localStorage.getItem(PLAYER_ID_KEY) || ""; } catch { return ""; }
}
function savePermanentPlayerId(id){
  try { localStorage.setItem(PLAYER_ID_KEY, id); } catch {}
}

