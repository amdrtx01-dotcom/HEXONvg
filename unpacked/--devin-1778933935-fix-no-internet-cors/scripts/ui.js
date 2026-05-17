/* ============================================================
   HEXON BETA — UI: login, menu, screens, settings, dropdowns
   ============================================================ */
"use strict";

/* ---------- Login / Profile setup ---------- */
function showLogin() {
  $("#login-screen").style.display = "";
  $("#app").style.display = "none";
}
function showApp() {
  $("#login-screen").style.display = "none";
  $("#app").style.display = "flex";
}
function registerLoginDay() {
  const key = todayKey();
  state.profile.loginDays = state.profile.loginDays || [];
  if (!state.profile.loginDays.includes(key)) {
    state.profile.loginDays.push(key);
  }
  state.profile.lastLoginDay = Date.now();
  evaluateAchievements();
}

let loginLangDD = null;
let setLangDD = null;
let currentScreen = "menu";

/* ---------- Device profile ---------- */
const DEVICE_OPTIONS = ["pc", "laptop", "tablet", "phone"];

function detectDevice() {
  const w = window.innerWidth;
  const ua = (navigator.userAgent || "").toLowerCase();
  const touch = matchMedia("(pointer: coarse)").matches;
  if (/ipad|tablet|playbook|silk/.test(ua) || (touch && w >= 720)) return "tablet";
  if (/iphone|ipod|android.*mobile|mobile/.test(ua) || (touch && w < 720)) return "phone";
  if (w >= 1280) return "pc";
  return "laptop";
}

function effectiveDevice() {
  const v = state.settings.device || "auto";
  return v === "auto" ? detectDevice() : v;
}

function applyDeviceProfile(device, opts) {
  const final = device === "auto" ? detectDevice() : device;
  document.documentElement.setAttribute("data-device", final);
  document.documentElement.setAttribute("data-device-setting", device);
  if (opts && opts.toast) {
    toast(t("toast.device", { device: t("device." + final) }), "info");
  }
}

/* Resize is fired *constantly* by mobile keyboards, address-bar
   shrinks, and orientation flicks. Debouncing through rAF keeps the
   layout reflow cost down to one per repaint and stops the layout
   from “thrashing” while the user is dragging a piece. */
let _resizeRaf = 0;
function onResizeMaybeApplyDevice() {
  if ((state.settings.device || "auto") !== "auto") return;
  if (_resizeRaf) return;
  _resizeRaf = requestAnimationFrame(() => {
    _resizeRaf = 0;
    applyDeviceProfile("auto");
  });
}

function init() {
  const persisted = loadState();
  if (persisted) {
    Object.assign(state.profile, persisted.profile || {});
    Object.assign(state.stats, persisted.stats || {});
    Object.assign(state.settings, persisted.settings || {});
    state.hidden = Object.assign({}, state.hidden, persisted.hidden || {});
    state.dailyTasks = persisted.dailyTasks || state.dailyTasks;
    state.achievements = new Set(persisted.achievements || []);
    state.leaderboards = persisted.leaderboards || [];
    if (persisted.wallet) state.wallet = Object.assign(state.wallet || { coins:0, lastDailyClaim:0 }, persisted.wallet);
    if (persisted.skins)  state.skins  = Object.assign(state.skins  || { equipped:"default", unlocked:["default"] }, persisted.skins);
    if (Array.isArray(persisted.usedActivationCodes)) state.usedActivationCodes = persisted.usedActivationCodes;
    if (persisted.activations) state.activations = Object.assign(state.activations || { redeemed:0, totalReceived:0, generated:0 }, persisted.activations);
    /* Per-nonce redemption counters for HX1/HX2 codes, and the set of
       direct-grant nonces this device has already credited. Both are
       written to disk by buildStateSnapshot; restoring them here is
       what keeps the activation cap honest across reloads. */
    if (persisted.activationUsage && typeof persisted.activationUsage === "object") state.activationUsage = persisted.activationUsage;
    if (Array.isArray(persisted.claimedGrants)) state.claimedGrants = persisted.claimedGrants;
  }

  /* Resurrect a permanent player ID from a dedicated key. This survives
     "Reset all" (which clears the main state) so the ID truly never
     changes for the lifetime of the install. */
  const perma = (typeof loadPermanentPlayerId === "function") ? loadPermanentPlayerId() : "";
  if (perma && !state.profile.id) state.profile.id = perma;
  if (!state.profile.id) state.profile.id = genId();
  if (typeof savePermanentPlayerId === "function") savePermanentPlayerId(state.profile.id);

  // theme & lang
  document.documentElement.setAttribute("data-theme", state.settings.theme || "dark");
  applyDeviceProfile(state.settings.device || "auto");
  if (typeof applySkinAccent === "function") applySkinAccent();
  window.addEventListener("resize", onResizeMaybeApplyDevice, { passive: true });

  // Build login lang dropdown
  loginLangDD = buildLangDropdown($("#login-lang-dropdown"), {
    value: state.settings.lang || "uk",
    onChange: (code) => {
      state.settings.lang = code;
      applyI18n();
      saveState();
    },
  });

  // Apply i18n
  applyI18n();

  // Build the device picker on the login screen. Each chip pins a
  // layout density; the "remember" toggle controls whether the choice
  // is restored next time we hit the login screen.
  setupLoginDevicePicker();

  // bind login
  const nickInput = $("#nickname-input");
  const pwdInput  = $("#password-input");
  const nickCount = $("#nick-count");
  const errBox    = $("#login-error");
  const permBox   = $("#login-perm");
  const pwToggle  = $("#password-toggle");

  if (state.profile.nickname) {
    nickInput.value = state.profile.nickname;
    nickCount.textContent = state.profile.nickname.length + "/20";
  }
  nickInput.addEventListener("input", () => {
    nickCount.textContent = nickInput.value.length + "/20";
    hideLoginError();
  });
  pwdInput.addEventListener("input", () => hideLoginError());
  pwToggle.addEventListener("click", () => {
    pwdInput.type = pwdInput.type === "password" ? "text" : "password";
    pwToggle.textContent = pwdInput.type === "password"
      ? t("login.show") || "show"
      : t("login.hide") || "hide";
  });

  // Permission UX: only show the file-access banner if we're inside the
  // Android WebView and the user hasn't granted it yet. Browser players
  // never see it.
  refreshLoginPermBanner();
  const permBtn = $("#login-perm-grant");
  if (permBtn) permBtn.addEventListener("click", () => {
    if (typeof HexBridge !== "undefined") {
      HexBridge.requestPermission();
      // Re-check on focus — when the user returns from settings the page
      // gets focus again.
      setTimeout(refreshLoginPermBanner, 250);
    }
  });
  window.addEventListener("focus", refreshLoginPermBanner);

  $("#login-confirm").addEventListener("click", handleLoginConfirm);
  nickInput.addEventListener("keydown", e => { if (e.key === "Enter") pwdInput.focus(); });
  pwdInput.addEventListener("keydown", e => { if (e.key === "Enter") handleLoginConfirm(); });

  // auto-resume if already registered AND we have a password hash (legacy
  // saves without one fall through to the login screen so the player can
  // set a password the first time they open the new build).
  if (state.profile.nickname && state.profile.id && state.profile.passwordHash) {
    registerLoginDay();
    enterApp();
  } else {
    showLogin();
  }
}

function showLoginError(msg){
  const box = document.getElementById("login-error");
  if(!box) return;
  box.textContent = msg;
  box.hidden = false;
}
function hideLoginError(){
  const box = document.getElementById("login-error");
  if(box) box.hidden = true;
}
function refreshLoginPermBanner(){
  const banner = document.getElementById("login-perm");
  if(!banner) return;
  const onAndroid = typeof HexBridge !== "undefined" && HexBridge.available && HexBridge.available();
  const hasPerm   = onAndroid && HexBridge.hasPermission && HexBridge.hasPermission();
  banner.hidden = !onAndroid || hasPerm;
}

/* Login / register flow ----------------------------------------------
   - If a profile file already exists for `nickname` on disk, we *must*
     match its password hash. On success we replace the in-memory state
     with the loaded blob and continue.
   - Otherwise we treat the form as a new registration: the nickname
     becomes ours, the new password hash is stored, and `state` is
     written back to disk on the next saveState().
   - Empty nicknames or empty passwords are rejected — both are required. */
async function handleLoginConfirm(){
  const nickInput = document.getElementById("nickname-input");
  const pwdInput  = document.getElementById("password-input");
  const name = (nickInput.value || "").trim();
  const pwd  = (pwdInput.value  || "").trim();
  if(!name){ showLoginError(t("login.err.no-name") || "Введіть нік"); return; }
  if(pwd.length < 4){ showLoginError(t("login.err.weak-pass") || "Пароль мін. 4 символи"); return; }

  const pwHash   = await sha256Hex(pwd);

  /* Admin gate. The literal nickname "admin" is reserved — nobody
     except the actual admin can claim it. Any other login attempt with
     this nick (case-insensitive) is rejected with a "reserved" message,
     and no profile is created. Even the password input is treated as
     blind — we never tell the user whether it was "close". The check
     runs BEFORE we touch the disk so a stale on-disk profile cannot be
     used to bypass it. */
  if (typeof ADMIN_NICKNAME === "string" && name.toLowerCase() === ADMIN_NICKNAME){
    if (pwHash !== ADMIN_PASSWORD_HASH){
      showLoginError(t("login.err.nick-reserved") || "Цей нікнейм зарезервовано");
      return;
    }
  }

  /* Try loading a saved profile for this nickname first. On Android the
     disk bridge is consulted; in the browser this falls back to the
     per-nickname localStorage cache built by saveProfileToDisk.
     The lookup is case-insensitive because safeProfileName() lowercases
     the lookup key — so "Alex" and "alex" resolve to the same profile. */
  let loaded = (typeof loadProfileFromDisk === "function")
    ? loadProfileFromDisk(name) : null;
  /* Reject the login if a profile exists and the password hash
     doesn't match. We require the saved profile to actually carry
     a password hash — legacy saves without one fall through to the
     "first time" branch so the player can set a fresh password. */
  if (loaded && loaded.passwordHash && loaded.passwordHash !== pwHash){
    showLoginError(t("login.err.bad-pass") || "Невірний пароль");
    /* Briefly highlight the password field to make the failure
       feel obvious — the toast-style errors are easy to miss on
       small screens. */
    pwdInput.focus();
    pwdInput.select && pwdInput.select();
    return;
  }
  let isReturning = false;
  if (loaded && loaded.state){
    /* Restore everything from disk and continue. The disk blob's state
       carries its own profile.id so we don't generate a new one. */
    applyLoadedSnapshot(loaded.state);
    state.profile.nickname = name.slice(0, 20);
    state.profile.passwordHash = pwHash;
    if (!state.profile.id) state.profile.id = genId();
    isReturning = true;
  } else {
    /* Fresh registration on this device. We deliberately mint a NEW
       HEXON ID rather than reusing whatever was left over in state,
       so different accounts always have different IDs. The
       per-nickname profile cache is the new "permanent" anchor. */
    state.profile.nickname = name.slice(0, 20);
    state.profile.passwordHash = pwHash;
    state.profile.id = genId();
    state.profile.registeredAt = Date.now();
    state.profile.lastLoginDay = 0;
    state.profile.loginDays = [];
    /* Also reset wallet / skins / stats so the fresh account doesn't
       inherit the previously-active account's progress. Anything that
       is per-profile and not strictly device-wide must be cleared here
       or the new account will silently inherit the previous one. */
    if (state.wallet) { state.wallet.coins = 0; state.wallet.lastDailyClaim = 0; }
    if (state.skins)  { state.skins.equipped = "default"; state.skins.unlocked = ["default"]; }
    if (state.achievements) state.achievements = new Set();
    state.usedActivationCodes = [];
    state.activationUsage = {};
    state.activations     = { redeemed:0, totalReceived:0, generated:0, history:[] };
    state.claimedGrants   = [];
    state.stats = { games:0, best:0, bestRun:0, totalScore:0, totalScoreFromGames:0, totalTimeMs:0, lines:0, bestCombo:0, placedTotal:0, xp:0 };
    state.hidden = {};
    state.dailyTasks = { date:"", tasks:[] };
  }
  if (typeof savePermanentPlayerId === "function") savePermanentPlayerId(state.profile.id);
  registerLoginDay();
  saveState();
  enterApp();
  if (isReturning){
    toast(
      t("toast.welcome-back", { name: state.profile.nickname }) ||
      ("З поверненням, " + state.profile.nickname + "!"),
      "success"
    );
  } else {
    toast(t("toast.welcome", { name: state.profile.nickname }), "success");
  }
}

/* Copy fields from a saved snapshot into the live state. We don't just
   replace `state` because other modules hold a direct reference to it. */
function applyLoadedSnapshot(snap){
  if(!snap || typeof snap !== "object") return;
  const k = ["profile","stats","settings","hidden","dailyTasks","leaderboards","wallet","skins","usedActivationCodes","activations","activationUsage","claimedGrants"];
  k.forEach(key => { if(snap[key] !== undefined) state[key] = snap[key]; });
  state.achievements = new Set(Array.isArray(snap.achievements) ? snap.achievements : []);
  state.run = null;
}

function setupLoginDevicePicker() {
  const grid = $("#login-device-grid");
  if (!grid) return;
  // If "remember" is OFF we treat the saved device as "auto" for the
  // purposes of the picker so the user makes a fresh choice each time.
  const initial = (state.settings.rememberDevice === false) ? "auto" : (state.settings.device || "auto");
  paintDeviceGrid(grid, initial, (code) => {
    state.settings.device = code;
    applyDeviceProfile(code);
    saveState();
    paintDeviceGrid(grid, code);
  });
  const rememberBtn = $("#login-remember");
  if (rememberBtn) {
    const sync = () => rememberBtn.classList.toggle("on", !!state.settings.rememberDevice);
    sync();
    rememberBtn.addEventListener("click", () => {
      state.settings.rememberDevice = !state.settings.rememberDevice;
      sync();
      saveState();
    });
  }
}

function paintDeviceGrid(grid, selected, onPick) {
  const items = [
    { code: "pc",     i18n: "device.pc",     icon: "i-monitor"   },
    { code: "laptop", i18n: "device.laptop", icon: "i-laptop"    },
    { code: "tablet", i18n: "device.tablet", icon: "i-tablet"    },
    { code: "phone",  i18n: "device.phone",  icon: "i-smartphone" },
    { code: "auto",   i18n: "login.detect",  icon: "i-bolt"      },
  ];
  if (onPick) grid.innerHTML = "";
  if (onPick || !grid.children.length) {
    grid.innerHTML = items.map(it => (
      '<button class="device-card" data-dev="' + it.code + '" type="button">' +
      '<svg class="ic-svg"><use href="#' + it.icon + '"/></svg>' +
      '<span data-i18n="' + it.i18n + '">' + t(it.i18n) + '</span>' +
      '</button>'
    )).join("");
    grid.querySelectorAll(".device-card").forEach(btn => {
      btn.addEventListener("click", () => onPick && onPick(btn.dataset.dev));
    });
  }
  grid.querySelectorAll(".device-card").forEach(btn => {
    btn.classList.toggle("on", btn.dataset.dev === selected);
  });
}

function enterApp() {
  showApp();
  buildBoardDom();
  startGame();
  bindAppEvents();
  if (typeof initShopWiring === "function") initShopWiring();
  if (typeof initBoosters === "function") initBoosters();
  if (typeof renderWallet === "function") renderWallet();
  refreshAllUI();
  // Stats avg uses totalScoreFromGames — backfill if missing
  if (typeof state.stats.totalScoreFromGames !== "number") {
    state.stats.totalScoreFromGames = (state.stats.best || 0); // best-effort
  }
  /* Kick off online leaderboard polling. The first GET runs
     immediately so the table is warm by the time the player
     opens the rankings screen, and subsequent GETs happen every
     60 seconds while the tab is visible (see leaderboard.js). */
  if (typeof startLeaderboardPolling === "function") startLeaderboardPolling();
  /* Kick off grant polling. Watches the shared activations bin
     for HEX-by-ID grants targeting our player ID, credits them
     to our wallet, and marks them claimed. Same 60 s cadence as
     leaderboards, and pauses when the tab is hidden. See
     scripts/activations.js. */
  if (typeof startGrantPolling === "function") startGrantPolling();
  /* Tournaments share the leaderboard bin, so we poll them on a
     slower cadence (2 min) — they barely change. See
     scripts/tournaments.js. */
  if (typeof startTournamentPolling === "function") startTournamentPolling();
  /* Wire the menu's "What's new" pill. It opens the changelog modal
     and flashes a dot when this build has unseen entries. */
  if (typeof wireWhatsnewControls === "function") wireWhatsnewControls();
  /* Submit our cached best score to the shared bin in case the
     last run never made it (e.g. the player closed the app while
     offline). Fire-and-forget. */
  if (typeof submitLeaderboardScore === "function") submitLeaderboardScore();
  // Start at the menu screen by default.
  go("menu");
}

/* Commit an abandoned run into the cross-run stats and discard
   state.run. Called when the player navigates away from the
   game screen without finishing the run. Records (best score,
   total games, achievements, etc.) are preserved — only the
   in-progress board/tray is dropped so the next visit to the
   game screen rolls a fresh layout with the currently equipped
   skin's palette. */
function commitAbandonedRunIfAny(){
  const r = state.run;
  if (!r) return;
  /* Only count it as a played game if the user actually placed
     anything — otherwise a "Play → Menu" tap shouldn't bump the
     games counter. */
  if (r.placedThisRun > 0){
    state.stats.games          = (state.stats.games || 0) + 1;
    state.stats.totalTimeMs    = (state.stats.totalTimeMs || 0) + (Date.now() - r.startedAt);
    state.stats.totalScoreFromGames = (state.stats.totalScoreFromGames || 0) + r.score;
    if (r.score > (state.stats.best || 0)) state.stats.best = r.score;
    if (typeof bumpDailyTask === "function") bumpDailyTask("games", 1);
    if (typeof evaluateAchievements === "function") evaluateAchievements();
    if (typeof updateLeaderboardsForMe === "function") updateLeaderboardsForMe();
  }
  state.run = null;
  saveState();
}

/* ---------- Screen navigation ----------
   Replaces the old tab system. Each navigable area (menu, game,
   settings, tasks, stats, profile, leaderboards, achievements)
   is its own full-viewport screen. */
function go(screen) {
  /* The Admin screen is locked to the admin user. If anyone else
     navigates there (e.g. via stale URL state or a debug call) we
     silently redirect them back to the menu. */
  if (screen === "admin" && !(typeof isAdminUser === "function" && isAdminUser())){
    screen = "menu";
  }
  const target = document.querySelector('[data-screen="' + screen + '"]');
  if (!target) return;

  /* Leaving the game screen always discards the active run so
     the next time the player taps "Play" they get a fresh
     board that uses whatever skin/palette they've just picked
     in the Shop. The best score and stats are preserved by
     commitAbandonedRunIfAny() above. The game-over modal
     already nukes state.run via endGame()+startGame(), so this
     only fires when the player navigates away mid-run. */
  if (currentScreen === "game" && screen !== "game" && state.run){
    commitAbandonedRunIfAny();
  }
  /* Entering the game screen with no active run starts a fresh
     one. This is what makes the freshly-equipped skin colors
     show up without forcing a full page reload. */
  if (screen === "game" && !state.run && typeof startGame === "function"){
    startGame();
  }

  $$(".screen").forEach(s => s.classList.toggle("active", s.dataset.screen === screen));
  currentScreen = screen;
  // refresh data when entering a section
  if (screen === "menu") renderMenu();
  if (screen === "stats") renderStats();
  if (screen === "profile") renderProfile();
  if (screen === "tasks") renderTasks();
  if (screen === "leaderboards") renderLeaderboards();
  if (screen === "achievements") renderAchievements();
  if (screen === "shop" && typeof renderShop === "function") renderShop();
  if (screen === "admin" && typeof renderAdminScreen === "function") renderAdminScreen();
  if (screen === "tournaments" && typeof renderTournaments === "function") renderTournaments();
  if (typeof renderWallet === "function") renderWallet();
  if (screen === "game") updateHUD();
}

/* Backwards-compatible alias used by older callers (e.g. game over modal). */
function activateTab(name) { go(name); }

/* ---------- Menu ---------- */
function renderMenu() {
  const name = state.profile.nickname || "Player";
  const { lvl } = levelInfo(state.stats.xp || 0);
  $("#menu-avatar").textContent = name.slice(0, 1).toUpperCase();
  $("#menu-name").textContent = name;
  $("#menu-level").textContent = lvl;
  $("#menu-best").textContent = (state.stats.best || 0).toLocaleString();
  $("#menu-card-best").textContent = (state.stats.best || 0).toLocaleString();
  $("#menu-card-level").textContent = lvl;
  /* Permanent player ID printed under the user pill (e.g. "ID HX-AB3C4-DE5F6"). */
  const idEl = $("#menu-player-id");
  if (idEl) idEl.textContent = "ID " + (state.profile.id || "—");
  /* Shop header coin amount mirrors the HUD pill. */
  const head = document.getElementById("shop-head-amount");
  if (head && typeof getCoins === "function") head.textContent = (typeof formatCoins === "function") ? formatCoins(getCoins()) : String(getCoins());
  /* Admin menu tile is hidden for everyone except the admin user. */
  const admTile = document.getElementById("menu-admin");
  if (admTile){
    const showAdm = (typeof isAdminUser === "function") && isAdminUser();
    admTile.classList.toggle("hidden", !showAdm);
  }
}

/* ---------- Admin screen ----------
   Built dynamically each time the screen is entered so it always sees
   the latest activation-code counters. The screen exposes three quick
   actions (grant 100k HEX, unlock all skins, copy own ID) and a code
   generator that binds an amount to a specific player ID. */
/* Quick-pick amounts used by the admin generator. Surfaced as buttons
   right above the amount input so the admin doesn't have to retype the
   most common values. */
const ADMIN_QUICK_AMOUNTS = [1000, 10000, 100000, 1000000];
/* Quick-pick max-uses chips. The "∞" chip maps to ACTIVATION_UNLIMITED
   on the wire so the encoded payload stays a finite integer. */
const ADMIN_QUICK_USES = [
  { v: 1,    label: "1" },
  { v: 5,    label: "5" },
  { v: 10,   label: "10" },
  { v: 50,   label: "50" },
  { v: 9999, label: "∞" },
];

function renderAdminScreen(){
  /* Refresh the top stat row from state. */
  const gen = document.getElementById("admin-stat-generated");
  const act = document.getElementById("admin-stat-activated");
  const hex = document.getElementById("admin-stat-hex");
  const fmt = (typeof formatCoins === "function") ? formatCoins : String;
  if (gen) gen.textContent = fmt((typeof generatedCodesCount === "function") ? generatedCodesCount() : 0);
  if (act) act.textContent = fmt((typeof redeemedCodesCount === "function") ? redeemedCodesCount() : 0);
  if (hex) hex.textContent = fmt((typeof redeemedCodesTotal === "function") ? redeemedCodesTotal() : 0);

  const panel = document.getElementById("admin-screen-panel");
  if (!panel) return;

  /* Make sure the activations container has a history slot. Older saves
     created before this version won't have one. */
  if (!state.activations) state.activations = { redeemed:0, totalReceived:0, generated:0, history:[] };
  if (!Array.isArray(state.activations.history)) state.activations.history = [];

  const quickPicks = ADMIN_QUICK_AMOUNTS.map(n =>
    '<button class="admin-quick" data-amt="' + n + '" type="button">' + fmt(n) + '</button>'
  ).join("");
  const quickUses = ADMIN_QUICK_USES.map(u =>
    '<button class="admin-quick admin-quick-uses" data-uses="' + u.v + '" type="button">' + u.label + '</button>'
  ).join("");

  panel.innerHTML =
    '<div class="admin-card">' +
      '<div class="admin-card-head">'+
        '<svg class="ic-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l7 4v6c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6l7-4z"/><path d="M9 12l2 2 4-4"/></svg>'+
        '<b data-i18n="admin.title">Admin Panel</b>'+
        '<span class="admin-id" id="admin-id-chip" title="' + (state.profile.id||'') + '">'+(state.profile.id||'')+'</span>'+
      '</div>'+
      '<div class="admin-actions">'+
        '<button class="btn btn-primary" id="admin-grant-100k" data-i18n="admin.act.grant">+100 000 HEX</button>'+
        '<button class="btn btn-primary" id="admin-unlock-all" data-i18n="admin.act.unlock">Unlock all skins</button>'+
        '<button class="btn btn-ghost"   id="admin-copy-id"   data-i18n="admin.act.copy">Copy ID</button>'+
        '<button class="btn btn-ghost admin-reset" id="admin-reset-counters" data-i18n="admin.act.reset">Reset counters</button>'+
      '</div>'+
      /* New: direct HEX grant by HEXON ID. Pushes a record into the
         shared bin; the target player picks it up on their next poll. */
      '<div class="admin-gen admin-grant">'+
        '<div class="admin-gen-head"><b data-i18n="admin.grant.title">Send HEX directly by ID</b></div>'+
        '<div class="admin-gen-hint" data-i18n="admin.grant.hint">The target player receives the HEX automatically the next time their app polls the network — no code required.</div>'+
        '<div class="admin-gen-field">'+
          '<label data-i18n="admin.grant.target">Recipient HEXON ID</label>'+
          '<div class="admin-gen-row">'+
            '<input type="text" id="admin-grant-id" placeholder="HX-XXXXX-XXXXX" autocomplete="off" spellcheck="false">'+
            '<button class="btn btn-ghost" id="admin-grant-fillself" type="button" data-i18n="admin.gen.fillself">Use my ID</button>'+
          '</div>'+
        '</div>'+
        '<div class="admin-gen-field">'+
          '<label data-i18n="admin.grant.amount">Amount (HEX)</label>'+
          '<div class="admin-gen-row">'+
            '<input type="number" id="admin-grant-amt" placeholder="HEX" min="1" max="10000000" value="10000">'+
          '</div>'+
          '<div class="admin-quick-row">' + quickPicks.replace(/admin-quick"/g, 'admin-quick admin-quick-grant"') + '</div>'+
        '</div>'+
        '<div class="admin-gen-row">'+
          '<button class="btn btn-primary" id="admin-grant-btn" data-i18n="admin.grant.btn">Send HEX</button>'+
        '</div>'+
        '<div class="admin-gen-out mono" id="admin-grant-out" data-i18n="admin.grant.idle">—</div>'+
      '</div>'+
      '<div class="admin-gen">'+
        '<div class="admin-gen-head"><b data-i18n="admin.gen.title">Public activation code</b></div>'+
        '<div class="admin-gen-hint" data-i18n="admin.gen.hint">A single code anyone can paste. Only the first N players in the world will catch it — the rest are rejected.</div>'+
        '<div class="admin-gen-field">'+
          '<label data-i18n="admin.gen.amount">Amount (HEX)</label>'+
          '<div class="admin-gen-row">'+
            '<input type="number" id="admin-gen-amt" placeholder="HEX" min="1" max="10000000" value="10000">'+
          '</div>'+
          '<div class="admin-quick-row">' + quickPicks + '</div>'+
        '</div>'+
        '<div class="admin-gen-field">'+
          '<label data-i18n="admin.gen.uses">Activations</label>'+
          '<div class="admin-gen-row">'+
            '<input type="number" id="admin-gen-uses" placeholder="4" min="1" max="9999" value="4">'+
            '<span class="admin-gen-uses-hint" data-i18n="admin.gen.uses.hint">First N players who paste the code</span>'+
          '</div>'+
          '<div class="admin-quick-row">' + quickUses + '</div>'+
        '</div>'+
        '<div class="admin-gen-row">'+
          '<button class="btn btn-primary" id="admin-gen-btn"  data-i18n="admin.gen.btn">Generate</button>'+
          '<button class="btn btn-ghost"   id="admin-gen-copy" data-i18n="admin.gen.copy" disabled>Copy</button>'+
        '</div>'+
        '<div class="admin-gen-out mono" id="admin-gen-out">—</div>'+
      '</div>'+
      '<div class="admin-history">'+
        '<div class="admin-history-head">'+
          '<b data-i18n="admin.history.title">Recent codes</b>'+
          '<button class="admin-history-clear" id="admin-history-clear" type="button" data-i18n="admin.history.clear">Clear history</button>'+
        '</div>'+
        '<div class="admin-history-list" id="admin-history-list"></div>'+
      '</div>'+
    '</div>';

  if (typeof applyI18n === "function") applyI18n();
  renderAdminHistory();

  document.getElementById("admin-grant-100k").addEventListener("click", () => {
    if (typeof addCoins === "function") addCoins(100000);
    if (typeof renderWallet === "function") renderWallet();
    toast("ADMIN: +100 000 HEX", "success");
  });
  document.getElementById("admin-unlock-all").addEventListener("click", () => {
    if (typeof SHOP_SKIN_ORDER !== "undefined" && typeof unlockSkin === "function"){
      SHOP_SKIN_ORDER.forEach(id => unlockSkin(id));
      saveState();
    }
    toast(t("admin.toast.unlocked") || "ADMIN: all skins unlocked", "success");
  });
  document.getElementById("admin-copy-id").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(state.profile.id || ""); toast(t("profile.copied") || "ID copied", "success"); }
    catch { toast(state.profile.id || "", "info"); }
  });
  document.getElementById("admin-reset-counters").addEventListener("click", () => {
    /* Reset only the admin-facing counters; the player's redeem totals
       stay untouched on purpose (that's a separate idea of "my codes"). */
    state.activations = { redeemed:0, totalReceived:0, generated:0, history:[] };
    saveState();
    renderAdminScreen();
    if (typeof renderShop === "function") renderShop();
    toast(t("admin.act.reset.ok") || "Counters reset", "success");
  });

  const genAmtInput = document.getElementById("admin-gen-amt");
  const genUsesInput = document.getElementById("admin-gen-uses");
  const genBtn  = document.getElementById("admin-gen-btn");
  const genOut  = document.getElementById("admin-gen-out");
  const genCopy = document.getElementById("admin-gen-copy");

  /* Direct-grant card inputs. The "Send HEX" button posts a grant
     record into the shared bin; the target player picks it up on
     their next poll tick. */
  const grantIdInput  = document.getElementById("admin-grant-id");
  const grantAmtInput = document.getElementById("admin-grant-amt");
  const grantBtn      = document.getElementById("admin-grant-btn");
  const grantOut      = document.getElementById("admin-grant-out");
  const grantFillSelf = document.getElementById("admin-grant-fillself");
  if (grantFillSelf) grantFillSelf.addEventListener("click", () => {
    if (!grantIdInput) return;
    grantIdInput.value = state.profile.id || "";
    grantIdInput.focus();
  });

  /* Quick-pick chips. Each `.admin-quick-row` is scoped to one input
     pair — the amount picker for the code generator writes to
     `genAmtInput`, the activations picker writes to `genUsesInput`,
     and the grant amount picker (marked with `admin-quick-grant`)
     writes to `grantAmtInput`. Highlighting fires only within the
     row that was clicked. */
  panel.querySelectorAll(".admin-quick-row").forEach(row => {
    row.querySelectorAll(".admin-quick").forEach(b => {
      b.addEventListener("click", () => {
        const isUses  = b.classList.contains("admin-quick-uses");
        const isGrant = b.classList.contains("admin-quick-grant");
        if (isUses){
          const u = parseInt(b.dataset.uses || "1", 10) || 1;
          if (u >= 1) genUsesInput.value = String(u);
          updateUsesHint();
        } else if (isGrant){
          const v = parseInt(b.dataset.amt || "0", 10) || 0;
          if (v > 0 && grantAmtInput) grantAmtInput.value = String(v);
        } else {
          const v = parseInt(b.dataset.amt || "0", 10) || 0;
          if (v > 0) genAmtInput.value = String(v);
        }
        row.querySelectorAll(".admin-quick").forEach(x => x.classList.toggle("on", x === b));
      });
    });
  });

  /* Live hint next to the activations input. The admin types "1" and
     sees "1 player only"; types "50" and sees "50 players"; picks the
     ∞ chip and sees "unlimited". Updates on every keystroke so the
     cap behaviour is obvious before they hit Generate. */
  const hintEl = panel.querySelector(".admin-gen-uses-hint");
  function updateUsesHint(){
    if (!hintEl) return;
    const raw = parseInt(genUsesInput.value, 10);
    const u = Math.max(1, Math.min(9999, isFinite(raw) ? raw : 1));
    if (u >= 9999){
      hintEl.textContent = "∞ · " + (t("admin.gen.uses.unlimited") || "unlimited");
    } else if (u === 1){
      hintEl.textContent = t("admin.gen.uses.single") || "1 player only";
    } else {
      const tmpl = t("admin.gen.uses.many") || "×\u202f{n} players";
      hintEl.textContent = tmpl.replace("{n}", u);
    }
  }
  if (genUsesInput){
    genUsesInput.addEventListener("input", updateUsesHint);
    /* Clamp out-of-range input on blur so the wire format never sees
       a value outside 1..9999. */
    genUsesInput.addEventListener("blur", () => {
      const raw = parseInt(genUsesInput.value, 10);
      const u = Math.max(1, Math.min(9999, isFinite(raw) ? raw : 1));
      genUsesInput.value = String(u);
      updateUsesHint();
      refreshGenBtnState();
    });
    updateUsesHint();
  }

  /* Reactive Generate button. HX3 codes only need amount + activation
     count — there is no target ID to fill in. */
  function refreshGenBtnState(){
    if (!genBtn) return;
    const amtOk  = (parseInt(genAmtInput.value, 10)  || 0) > 0;
    const usesOk = (parseInt(genUsesInput.value, 10) || 0) >= 1;
    const ready  = amtOk && usesOk;
    genBtn.disabled = !ready;
    genBtn.classList.toggle("is-ready", ready);
  }
  genAmtInput && genAmtInput.addEventListener("input", refreshGenBtnState);
  genUsesInput && genUsesInput.addEventListener("input", refreshGenBtnState);
  panel.querySelectorAll(".admin-quick").forEach(b => b.addEventListener("click", () => requestAnimationFrame(refreshGenBtnState)));
  refreshGenBtnState();

  /* Reactive Send-HEX-by-ID button. The button is disabled until
     the admin has supplied both a non-empty target ID and a
     positive amount. */
  function refreshGrantBtnState(){
    if (!grantBtn) return;
    const idOk  = !!(grantIdInput && (grantIdInput.value || "").trim());
    const amtOk = !!(grantAmtInput && ((parseInt(grantAmtInput.value, 10) || 0) > 0));
    const ready = idOk && amtOk;
    grantBtn.disabled = !ready;
    grantBtn.classList.toggle("is-ready", ready);
  }
  grantIdInput  && grantIdInput.addEventListener("input", refreshGrantBtnState);
  grantAmtInput && grantAmtInput.addEventListener("input", refreshGrantBtnState);
  grantFillSelf && grantFillSelf.addEventListener("click", () => requestAnimationFrame(refreshGrantBtnState));
  panel.querySelectorAll(".admin-quick-grant").forEach(b => b.addEventListener("click", () => requestAnimationFrame(refreshGrantBtnState)));
  refreshGrantBtnState();

  genBtn.addEventListener("click", async () => {
    const amt  = parseInt(genAmtInput.value, 10) || 0;
    const uses = Math.max(1, Math.min(9999, parseInt(genUsesInput.value, 10) || 1));
    /* Defence-in-depth: button is disabled while invalid, but a
       second guard here covers programmatic clicks too. */
    if (amt <= 0 || uses < 1){
      genOut.textContent = "—";
      genCopy.disabled = true;
      toast(t("admin.gen.err.input") || "Amount + activations required", "error");
      return;
    }
    try {
      const code = await makePublicActivationCode(amt, uses);
      genOut.textContent = code;
      genCopy.disabled = false;
      genCopy.dataset.code = code;
      if (!state.activations) state.activations = { redeemed:0, totalReceived:0, generated:0, history:[] };
      state.activations.generated = (state.activations.generated | 0) + 1;
      if (!Array.isArray(state.activations.history)) state.activations.history = [];
      /* Newest first, capped at 10 so the panel doesn't grow forever.
         `id` is left empty for public codes — the history row renders
         "Public" for those. */
      state.activations.history.unshift({ code, id: "", amount: amt, maxUses: uses, at: Date.now() });
      state.activations.history = state.activations.history.slice(0, 10);
      saveState();
      const genEl = document.getElementById("admin-stat-generated");
      if (genEl) genEl.textContent = fmt(state.activations.generated);
      try { await navigator.clipboard.writeText(code); } catch {}
      toast(t("admin.gen.ok") || "Code generated and copied", "success");
      renderAdminHistory();
    } catch (e) {
      genOut.textContent = "—";
      toast("Failed: " + (e && e.message || e), "error");
    }
  });
  genCopy.addEventListener("click", async () => {
    const code = genCopy.dataset.code || genOut.textContent || "";
    if (!code || code === "—") return;
    try { await navigator.clipboard.writeText(code); toast(t("admin.gen.copied") || "Copied", "success"); }
    catch { toast(code, "info"); }
  });

  /* "Send HEX directly by ID" — pushes a grant record into the shared
     bin. Failures (offline, bad input) are surfaced via toast; the
     output box echoes the latest status so the admin can see what
     happened without scrolling the toast stack. */
  if (grantBtn) grantBtn.addEventListener("click", async () => {
    const id  = ((grantIdInput && grantIdInput.value) || "").trim();
    const amt = parseInt((grantAmtInput && grantAmtInput.value) || "0", 10) || 0;
    if (!id || amt <= 0){
      if (grantOut) grantOut.textContent = "—";
      toast(t("admin.grant.err.input") || "ID + amount required", "error");
      return;
    }
    grantBtn.disabled = true;
    if (grantOut) grantOut.textContent = t("admin.grant.sending") || "Sending…";
    try {
      const r = await pushGrantById(id, amt);
      const tmpl = t("admin.grant.sent") || "Sent +{n} HEX → {id}";
      if (grantOut) grantOut.textContent = tmpl.replace("{n}", String(r.amount)).replace("{id}", r.id);
      toast(t("admin.grant.ok") || "HEX sent", "success");
      /* Mirror this into the admin history list so the admin can see
         exactly what was dispatched. */
      if (!state.activations) state.activations = { redeemed:0, totalReceived:0, generated:0, history:[] };
      if (!Array.isArray(state.activations.history)) state.activations.history = [];
      state.activations.history.unshift({ code: "", id: r.id, amount: r.amount, maxUses: 1, at: Date.now(), grant: true });
      state.activations.history = state.activations.history.slice(0, 10);
      saveState();
      renderAdminHistory();
      if (grantAmtInput) grantAmtInput.value = "10000";
      if (grantIdInput)  grantIdInput.value  = "";
    } catch (e) {
      const msg = (e && e.message) || String(e);
      if (grantOut) grantOut.textContent = "—";
      const friendly = (msg === "offline")
        ? (t("admin.grant.err.offline") || "Offline — try again")
        : (msg === "bad amount")
          ? (t("admin.grant.err.amount") || "Invalid amount")
          : (msg === "missing id")
            ? (t("admin.grant.err.id") || "Recipient ID required")
            : ("Failed: " + msg);
      toast(friendly, "error");
    } finally {
      grantBtn.disabled = false;
      refreshGrantBtnState();
    }
  });

  document.getElementById("admin-history-clear").addEventListener("click", () => {
    if (!state.activations) return;
    state.activations.history = [];
    saveState();
    renderAdminHistory();
  });
}

/* Paint the "Recent codes" list under the generator. Each row shows the
   target ID, amount, and a copy button; clicking the code text itself
   also copies. The list is purely a convenience — the canonical code
   value lives in the row's dataset and is never re-derived. */
function renderAdminHistory(){
  const list = document.getElementById("admin-history-list");
  if (!list) return;
  const fmt = (typeof formatCoins === "function") ? formatCoins : String;
  const items = (state.activations && Array.isArray(state.activations.history))
    ? state.activations.history : [];
  if (items.length === 0){
    list.innerHTML = '<div class="admin-history-empty" data-i18n="admin.history.empty">' +
      (t("admin.history.empty") || "No codes generated yet") + '</div>';
    return;
  }
  list.innerHTML = items.map((it, idx) => {
    const maxUses = it.maxUses | 0;
    const isGrant = !!it.grant;
    /* Three row shapes:
       - direct grant by ID: shows the recipient, no code body
       - public HX3 code:    shows "Public" instead of an ID,
                             with the activations badge
       - legacy HX1/HX2:     shows the bound target ID + badge */
    const usesBadge = (!isGrant && maxUses > 1)
      ? ('<span class="admin-history-uses">\u00d7' + (maxUses >= 9999 ? "\u221e" : maxUses) + '</span>')
      : "";
    const grantBadge = isGrant
      ? ('<span class="admin-history-grant" data-i18n="admin.history.grant">' + (t("admin.history.grant") || "GRANT") + '</span>')
      : "";
    const idLabel = isGrant
      ? (it.id || "?")
      : (it.id ? it.id : (t("admin.history.public") || "Public"));
    const codeCell = isGrant
      ? ('<span class="admin-history-code mono admin-history-grant-msg">' + (t("admin.history.grant.note") || "Pushed to network") + '</span>')
      : ('<code class="admin-history-code mono">' + (it.code || "") + '</code>');
    const copyBtn = isGrant
      ? ""
      : '<button class="admin-history-copy" type="button" title="Copy">\u29c9</button>';
    return (
      '<div class="admin-history-row" data-idx="' + idx + '">' +
        '<div class="admin-history-meta">' +
          '<b class="mono">' + idLabel + '</b>' +
          '<span class="admin-history-amt">+' + fmt(it.amount || 0) + ' HEX</span>' +
          usesBadge + grantBadge +
        '</div>' +
        codeCell +
        copyBtn +
      '</div>'
    );
  }).join("");
  list.querySelectorAll(".admin-history-row").forEach(row => {
    const idx = parseInt(row.dataset.idx || "-1", 10);
    const it  = items[idx];
    if (!it || it.grant) return;
    const copy = async () => {
      try { await navigator.clipboard.writeText(it.code || ""); toast(t("admin.gen.copied") || "Copied", "success"); }
      catch { toast(it.code || "", "info"); }
    };
    const codeEl = row.querySelector(".admin-history-code");
    const btnEl  = row.querySelector(".admin-history-copy");
    if (codeEl) codeEl.addEventListener("click", copy);
    if (btnEl)  btnEl.addEventListener("click", copy);
  });
}

/* ---------- App events ---------- */
function bindAppEvents() {
  // navigation buttons (menu tiles, play card, back buttons)
  $$("[data-go]").forEach(btn => {
    btn.addEventListener("click", () => go(btn.dataset.go));
  });

  // settings: language dropdown
  setLangDD = buildLangDropdown($("#set-lang-dropdown"), {
    value: state.settings.lang || "uk",
    onChange: (code) => {
      state.settings.lang = code;
      applyI18n();
      renderAllText();
      saveState();
      if (loginLangDD) loginLangDD.setValue(code);
    },
  });

  // theme
  document.querySelectorAll("#set-theme button").forEach(b => {
    if (b.dataset.val === state.settings.theme) b.classList.add("on"); else b.classList.remove("on");
    b.addEventListener("click", () => {
      state.settings.theme = b.dataset.val;
      document.documentElement.setAttribute("data-theme", state.settings.theme);
      document.querySelectorAll("#set-theme button").forEach(x => x.classList.toggle("on", x.dataset.val === state.settings.theme));
      saveState();
    });
  });

  // sound / vibration
  const soundBtn = $("#set-sound");
  soundBtn.classList.toggle("on", !!state.settings.sound);
  soundBtn.addEventListener("click", () => {
    state.settings.sound = !state.settings.sound;
    soundBtn.classList.toggle("on", state.settings.sound);
    saveState();
    if (state.settings.sound) sfx.toast();
  });
  const vibBtn = $("#set-vibrate");
  vibBtn.classList.toggle("on", !!state.settings.vibration);
  vibBtn.addEventListener("click", () => {
    state.settings.vibration = !state.settings.vibration;
    vibBtn.classList.toggle("on", state.settings.vibration);
    saveState();
    if (state.settings.vibration) vibrate(20);
  });

  $("#btn-reset-all").addEventListener("click", () => {
    // Tiny inline confirm using the toast stack — `confirm()` is jarring
    // inside a WebView. Two clicks within 3s commit the reset.
    const btn = $("#btn-reset-all");
    if (btn.dataset.armed === "1") {
      btn.dataset.armed = "0";
      /* Reset everything EXCEPT the permanent player ID, which lives
         under its own key. The user explicitly asked that the ID never
         change after being issued. */
      const keptId = (typeof loadPermanentPlayerId === "function") ? loadPermanentPlayerId() : (state.profile && state.profile.id);
      localStorage.removeItem(STORE_KEY);
      if (keptId && typeof savePermanentPlayerId === "function") savePermanentPlayerId(keptId);
      location.reload();
      return;
    }
    btn.dataset.armed = "1";
    btn.classList.add("armed");
    toast(t("set.reset.sub") + " — " + t("set.reset.btn") + " ?", "warn");
    setTimeout(() => { btn.dataset.armed = "0"; btn.classList.remove("armed"); }, 3000);
  });

  // restart
  $("#btn-restart").addEventListener("click", () => {
    // count abandoned run into games if score>0
    if (state.run && state.run.score > 0) {
      state.stats.games = (state.stats.games || 0) + 1;
      state.stats.totalScoreFromGames = (state.stats.totalScoreFromGames || 0) + state.run.score;
      state.stats.totalTimeMs = (state.stats.totalTimeMs || 0) + (Date.now() - state.run.startedAt);
      bumpDailyTask("games", 1);
      updateLeaderboardsForMe();
      evaluateAchievements();
    }
    startGame();
  });

  // how to
  $("#btn-howto").addEventListener("click", () => openModal("#modal-howto"));
  $("#howto-close").addEventListener("click", () => closeModal("#modal-howto"));
  $("#modal-howto").addEventListener("click", e => { if (e.target.id === "modal-howto") closeModal("#modal-howto"); });

  // Exit / leave-confirmation modal opened from the main menu.
  // The grid offers four intents instead of a yes/no — "stay",
  // "pause" (back to menu), "sign out" (clear profile), and
  // "quit" (best-effort close + sign out).
  $("#menu-exit").addEventListener("click", () => openModal("#modal-exit"));
  $("#modal-exit").addEventListener("click", e => { if (e.target.id === "modal-exit") closeModal("#modal-exit"); });
  $("#exit-stay").addEventListener("click", () => { closeModal("#modal-exit"); });
  $("#exit-pause").addEventListener("click", () => { closeModal("#modal-exit"); go("menu"); });
  $("#exit-signout").addEventListener("click", () => {
    /* "Sign out" clears the nickname and password hash so the login
       screen shows again. We don't touch the file on disk — re-typing
       the same nick + password restores the saved profile. The
       permanent HEXON ID stays preserved in its mirror key for the
       next fresh registration. */
    state.profile.nickname = "";
    state.profile.passwordHash = "";
    saveState();
    if (typeof savePermanentPlayerId === "function" && state.profile.id) savePermanentPlayerId(state.profile.id);
    location.reload();
  });
  $("#exit-quit").addEventListener("click", () => {
    /* Best-effort "quit": works in WebView (Android JS bridge) when
       present, in PWAs, and falls back to history.back() / about:blank
       in regular browsers. We also clear the active run so re-opening
       starts fresh. */
    state.run = null; saveState();
    if (window.AndroidHexon && typeof window.AndroidHexon.exit === "function") {
      try { window.AndroidHexon.exit(); return; } catch {}
    }
    try { window.close(); } catch {}
    setTimeout(() => { window.location.href = "about:blank"; }, 150);
  });

  // game over modal
  // (endGame already records totalScoreFromGames for us, so the
  //  buttons here just close the modal and reset the run.)
  $("#m-play-again").addEventListener("click", () => {
    closeModal("#modal-gameover");
    startGame();
    refreshAllUI();
  });
  $("#m-menu").addEventListener("click", () => {
    closeModal("#modal-gameover");
    startGame();
    refreshAllUI();
    go("menu");
  });

  // achievements filter & search
  document.querySelectorAll("#ach-filter button").forEach(b => {
    b.addEventListener("click", () => {
      document.querySelectorAll("#ach-filter button").forEach(x => x.classList.remove("on"));
      b.classList.add("on");
      achFilter = b.dataset.val;
      renderAchievements();
    });
  });
  const search = $("#ach-search");
  search.addEventListener("input", () => {
    achQuery = search.value;
    renderAchievements();
  });

  // logout from the profile screen now also goes through the exit modal
  $("#btn-logout").addEventListener("click", () => openModal("#modal-exit"));

  // profile: copy ID — click on the badge OR on the dedicated button
  const copyId = async () => {
    const id = state.profile.id || "";
    if (!id) return;
    try {
      await navigator.clipboard.writeText(id);
    } catch {
      // Fallback for browsers without async clipboard API.
      const ta = document.createElement("textarea");
      ta.value = id; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); } finally { ta.remove(); }
    }
    toast(t("profile.copied"), "success");
  };
  const profCopyBtn = $("#prof-copy");
  const profIdBadge = $("#prof-id");
  if (profCopyBtn) profCopyBtn.addEventListener("click", copyId);
  if (profIdBadge) profIdBadge.addEventListener("click", copyId);

  // settings: device picker
  const setGrid = $("#set-device-grid");
  if (setGrid) {
    paintDeviceGrid(setGrid, state.settings.device || "auto", (code) => {
      state.settings.device = code;
      applyDeviceProfile(code, { toast: true });
      saveState();
      paintDeviceGrid(setGrid, code);
    });
  }
}

function renderAllText() {
  applyI18n();
  renderTasks();
  renderLeaderboards();
  renderAchievements();
  renderMenu();
  // sync dropdowns
  if (loginLangDD) loginLangDD.setValue(state.settings.lang);
  if (setLangDD) setLangDD.setValue(state.settings.lang);
}
