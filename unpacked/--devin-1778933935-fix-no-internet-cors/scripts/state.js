/* ---------- State ---------- */
const state = {
  /* `passwordHash` is the sha-256 hex of the plaintext password the
     player chose at registration. We never store the plaintext. */
  profile: { nickname:"", id:"", passwordHash:"", registeredAt:0, lastLoginDay:0, loginDays:[] },
  /* Activation-code nonces that have been fully consumed (used up to
     their cap) on this device. Kept around for back-compat with older
     code paths that just want to know "have I seen this nonce?". */
  usedActivationCodes: [],
  /* Per-nonce usage counter for the activation-code system. A code is
     accepted while `activationUsage[nonce] < maxUses` and rejected on
     the redemption that would push it past the cap. Older saves that
     only have `usedActivationCodes` are migrated lazily on first use. */
  activationUsage: {},
  /* Aggregate counters for the activation-code system. `redeemed` and
     `totalReceived` track codes this player has cashed in on this
     device; `generated` tracks codes this admin has produced.
     `history` is the admin's last 10 generated codes (newest first),
     each `{ code, id, amount, maxUses, at }` (a `grant:true` flag is
     set on rows produced by the "Send HEX by ID" button). All fields
     are read by the Activate-code shop tab and the Admin screen. */
  activations: { redeemed: 0, totalReceived: 0, generated: 0, history: [] },
  /* Nonces of admin-pushed "Grant HEX by ID" records that this device
     has already credited to its wallet. Prevents double-spend if the
     polling loop sees the same grant twice (e.g. when the JSONBlob
     PUT to mark a grant claimed races with another player's PUT). */
  claimedGrants: [],
  stats: { games:0, best:0, bestRun:0, totalScore:0, totalTimeMs:0, lines:0, bestCombo:0, placedTotal:0, xp:0 },
  settings: {
    lang: "uk",
    sound: true,
    vibration: true,
    theme: "dark",
    /* "auto" detects from screen width on each launch.
       "pc" / "laptop" / "tablet" / "phone" pin a specific layout density. */
    device: "auto",
    /* When true the chosen device is restored on every future login.
       When false the user is asked again on the next login screen. */
    rememberDevice: true,
  },
  achievements: new Set(), // ids
  hidden: { firstPlace:false, tripleClear:false, quadClear:false, speedrun:false, pacifist:false, survivor:false, cleaner:false },
  dailyTasks: { date:"", tasks:[] },
  leaderboards: [], // simulated global pool
  /* HEX coin wallet. `coins` is the spendable balance; `lastDailyClaim`
     is the unix ms at which the daily reward was last claimed. The
     reward is gated to "today after 11:00 local" and a single claim
     per calendar day — see scripts/wallet.js. */
  wallet: { coins: 0, lastDailyClaim: 0 },
  /* Piece-skin inventory. `equipped` is the active palette id; the
     definitions live in scripts/skins.js. Every player starts with
     the default skin already unlocked. */
  skins:  { equipped: "default", unlocked: ["default"] },
  /* One-time consumable power-ups purchased in the "Бусти" shop tab.
     The values are counts of how many of each booster the player
     currently owns. They're spent on the in-game booster bar above
     the board (see scripts/game.js). Each booster is one-shot and the
     count never goes below zero. Older saves missing this object are
     migrated to an empty bag on load. */
  boosts: { shuffle: 0, bomb: 0, lightning: 0, hint: 0, skip: 0 },
  // live, not persisted
  run: null,
};

/* ---------- XP / Level ---------- */
function levelInfo(totalXp){
  // levels grow: need(level) = 80 + level*40
  let lvl = 1, remaining = totalXp;
  while(true){
    const need = 80 + (lvl-1)*40;
    if(remaining < need) return { lvl, into: remaining, need };
    remaining -= need;
    lvl++;
    if(lvl > 999) return { lvl, into: 0, need: 80 + (lvl-1)*40 };
  }
}
function addXP(n){
  const before = levelInfo(state.stats.xp).lvl;
  state.stats.xp = (state.stats.xp||0) + n;
  const after = levelInfo(state.stats.xp).lvl;
  if(after > before){
    toast(t("toast.lvlup",{n:after}), "success");
    if(window.fx) fx.celebrateLevelUp(after);
    else { if(typeof sfx !== "undefined") sfx.lvlup(); vibrate(30); }
  }
}

