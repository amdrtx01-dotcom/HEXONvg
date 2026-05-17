/* ============================================================
   HEXON BETA — Profile persistence + crypto helpers
   ============================================================
   Two responsibilities live here:

     1. Bridge wrappers around window.AndroidHexon (the Java side
        defined in MainActivity.java). They expose:
          - hasStoragePermission()  / requestStoragePermission()
          - saveProfile(name, json) / loadProfile(name)
          - listProfiles()          / profileExists(name)
        In a regular browser (no bridge) every call returns a sane
        no-op so the same JS works on desktop too.

     2. Two small crypto helpers used by the login flow and the
        admin activation codes:
          - sha256Hex(str)          — SHA-256, lower-case hex
          - hmacSha256Hex(key, str) — HMAC-SHA256, lower-case hex
        Both run on the standard `crypto.subtle` API that ships
        in every Android WebView since API 28. We don't rely on
        any node-only library.
   ============================================================ */
"use strict";

/* ---------- Android bridge wrapper ---------- */
const HexBridge = {
  available(){ return !!(typeof window !== "undefined" && window.AndroidHexon); },
  hasPermission(){
    try { return this.available() && !!window.AndroidHexon.hasStoragePermission(); }
    catch { return false; }
  },
  requestPermission(){
    try { if(this.available()) window.AndroidHexon.requestStoragePermission(); }
    catch {}
  },
  saveProfile(name, json){
    try { return this.available() && !!window.AndroidHexon.saveProfile(name||"", json||""); }
    catch { return false; }
  },
  loadProfile(name){
    try { return this.available() ? (window.AndroidHexon.loadProfile(name||"") || "") : ""; }
    catch { return ""; }
  },
  listProfiles(){
    try {
      if(!this.available()) return [];
      const raw = window.AndroidHexon.listProfiles() || "[]";
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch { return []; }
  },
  profileExists(name){
    try { return this.available() && !!window.AndroidHexon.profileExists(name||""); }
    catch { return false; }
  }
};

/* ---------- Crypto helpers ----------
   `crypto.subtle` returns ArrayBuffers; we always render them as
   lower-case hex because that's what the activation-code format
   uses on the wire. */
async function _digest(algoOrKey, data){
  const enc = new TextEncoder();
  if(typeof algoOrKey === "string"){
    const buf = await crypto.subtle.digest(algoOrKey, enc.encode(data));
    return _hex(buf);
  } else {
    const buf = await crypto.subtle.sign("HMAC", algoOrKey, enc.encode(data));
    return _hex(buf);
  }
}
function _hex(buf){
  const b = new Uint8Array(buf);
  let s = "";
  for(let i=0;i<b.length;i++) s += b[i].toString(16).padStart(2,"0");
  return s;
}
async function sha256Hex(str){
  return _digest("SHA-256", String(str||""));
}
async function hmacSha256Hex(secret, message){
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(String(secret||"")),
    { name:"HMAC", hash:"SHA-256" }, false, ["sign"]);
  return _digest(key, String(message||""));
}

/* ---------- Profile file <-> state ----------
   The disk file is the *source of truth* on Android. localStorage
   is kept as a fast read-cache and a fallback for non-Android
   environments. Schema:

     { version: 1,
       nickname: "...",
       passwordHash: "<sha-256 hex>",
       state: <the full saveState() blob>,
       savedAt: <epoch ms> }

   No plaintext password is ever stored — we only keep the hash. */
const PROFILE_FILE_VERSION = 1;

function safeProfileName(name){
  /* Keep Unicode letters & digits so Cyrillic / Ukrainian nicknames
     (the game's default audience) survive sanitisation. Mirrors the
     Java `safeName()` in MainActivity.java which uses
     Character.isLetterOrDigit() — if these two diverge the Android
     disk file and the JS lookup key drift apart and "profile survives
     reinstall" silently breaks. */
  return String(name||"").toLowerCase().replace(/[^\p{L}\p{N}_-]/gu,"").slice(0,40);
}

async function buildProfileBlob(nickname, passwordHash){
  /* The saveState helper in storage.js builds the same shape used
     by localStorage. We piggy-back on it so disk and localStorage
     stay byte-for-byte identical. */
  const stateBlob = (typeof buildStateSnapshot === "function")
    ? buildStateSnapshot()
    : (typeof state === "object" ? state : {});
  return {
    version: PROFILE_FILE_VERSION,
    nickname: nickname,
    passwordHash: passwordHash,
    savedAt: Date.now(),
    state: stateBlob
  };
}

/* Per-nickname browser fallback. Lets non-Android web players also
   keep separate accounts on the same browser and enforces the
   password check on re-login. The key is salted with the safe-name
   so different player nicks never collide. */
const PROFILE_LS_PREFIX = "hexon.beta.profile.";
function profileLsKey(nick){ return PROFILE_LS_PREFIX + safeProfileName(nick); }

async function saveProfileToDisk(){
  const nick = state && state.profile && state.profile.nickname;
  const pwh  = state && state.profile && state.profile.passwordHash;
  if(!nick || !pwh) return false;
  const blob = await buildProfileBlob(nick, pwh);
  const json = JSON.stringify(blob);
  let wrote = false;
  /* Primary: Android disk (survives uninstall). */
  if(HexBridge.available() && HexBridge.hasPermission()){
    wrote = !!HexBridge.saveProfile(safeProfileName(nick), json) || wrote;
  }
  /* Fallback: browser localStorage so the in-browser flow can still
     verify the password on the next login. */
  try { localStorage.setItem(profileLsKey(nick), json); wrote = true; } catch {}
  return wrote;
}

function loadProfileFromDisk(nickname){
  /* Disk first (Android), then localStorage (web). Both branches return
     the parsed profile blob or null. */
  if(HexBridge.available()){
    const raw = HexBridge.loadProfile(safeProfileName(nickname));
    if(raw){ try { return JSON.parse(raw); } catch {} }
  }
  try {
    const raw = localStorage.getItem(profileLsKey(nickname));
    if(raw){ return JSON.parse(raw); }
  } catch {}
  return null;
}

/* ---------- Admin credentials ----------
   The admin role is gated by a fixed nickname + password pair so an
   arbitrary user can't pick the "admin" handle on first registration.
   The login flow in ui.js compares the incoming password's SHA-256
   hash against ADMIN_PASSWORD_HASH; the plaintext only lives in
   `ADMIN_PASSWORD` below for documentation. Both values are public —
   this is *not* a security boundary, only a convenience gate so
   normal players don't accidentally end up in the admin screen. */
const ADMIN_NICKNAME = "admin";
const ADMIN_PASSWORD = "hexon-admin-2025";
/* SHA-256("hexon-admin-2025") — pre-computed so we don't pay the
   crypto.subtle cost at boot, and so the plaintext can be rotated in
   one place if it ever moves. */
const ADMIN_PASSWORD_HASH = "05209a907afbebe33e669ffc7e6122a59e711f1d139ae195ab3ac881664974a8";

/* ---------- Activation codes ----------
   Three wire formats are supported:

     HX3-<AMOUNT>-<MAXUSES>-<NONCE>-<SIG10>                (public)
     HX2-<TARGETID12>-<AMOUNT>-<MAXUSES>-<NONCE>-<SIG10>   (legacy)
     HX1-<TARGETID12>-<AMOUNT>-<NONCE>-<SIG10>             (legacy)

   HX3 is a *public* code: it carries no target ID. Anyone can
   redeem it, but the admin caps how many distinct players are
   ever allowed to claim a slot. The global counter lives in the
   shared JSONBlob bin (see scripts/activations.js) — if 10 players
   try to redeem a code minted for 4 activations, the first 4 in
   the race succeed and the rest get rejected.

   HX2 / HX1 stay around for backwards compatibility — codes minted
   before this update was shipped target a specific HEXON ID and
   their max-uses counter is enforced *per device* in
   state.activationUsage. Newly minted codes always use HX3.

   In HX1/HX2 TARGETID12 is the player ID with dashes stripped,
   AMOUNT is the HEX delta as a base-10 integer, NONCE is a 6-char
   random base-32 string, and SIG10 is the first 10 hex chars of
   HMAC-SHA256(ACTIVATION_SECRET, "<VER>|TARGET|AMOUNT|[USES|]NONCE").
   HX3 drops TARGET from both the wire format and the signed payload.
   The shared secret is a constant; this is *not* meant to defend
   against a determined attacker who decompiles the APK, only to
   keep casual cheaters from forging codes. */
const ACTIVATION_SECRET = "hex0n_beta_v1_activation_secret_2025";
/* Sentinel for "unlimited" max-uses in the UI. Encoded as 9999 on
   the wire so the signature payload stays a finite base-10 integer. */
const ACTIVATION_UNLIMITED = 9999;

function _b32nonce(len){
  const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = ""; const r = new Uint32Array(len);
  if(crypto && crypto.getRandomValues) crypto.getRandomValues(r);
  else for(let i=0;i<len;i++) r[i] = Math.floor(Math.random()*0xffffffff);
  for(let i=0;i<len;i++) s += A[r[i] % A.length];
  return s;
}
function _strip(s){ return String(s||"").replace(/-/g,"").toUpperCase(); }
function _clampMaxUses(n){
  const v = Math.floor(Number(n) || 1);
  if(!isFinite(v) || v < 1) return 1;
  if(v > ACTIVATION_UNLIMITED) return ACTIVATION_UNLIMITED;
  return v;
}

async function makeActivationCode(targetId, amount, maxUses){
  /* Legacy entry point — minted a target-bound HX1/HX2 code. The
     new admin UI always goes through makePublicActivationCode()
     below, but this function stays around for any caller that
     still wants per-ID codes (e.g. an external script that drives
     the generator). */
  const tid   = _strip(targetId);
  const amt   = Math.max(0, Math.floor(Number(amount)||0));
  const uses  = _clampMaxUses(maxUses);
  const nonce = _b32nonce(6);
  if(uses === 1){
    const msg = "HX1|" + tid + "|" + amt + "|" + nonce;
    const sig = (await hmacSha256Hex(ACTIVATION_SECRET, msg)).slice(0, 10).toUpperCase();
    return "HX1-" + tid + "-" + amt + "-" + nonce + "-" + sig;
  }
  const msg = "HX2|" + tid + "|" + amt + "|" + uses + "|" + nonce;
  const sig = (await hmacSha256Hex(ACTIVATION_SECRET, msg)).slice(0, 10).toUpperCase();
  return "HX2-" + tid + "-" + amt + "-" + uses + "-" + nonce + "-" + sig;
}

/* Mint a public HX3 code. No target ID is encoded; the global
   activation cap is enforced cross-device by activations.js. The
   admin panel always calls this path now — generating a code with
   maxUses=4 means "the next 4 distinct players to redeem will get
   the HEX, everybody after that gets rejected". */
async function makePublicActivationCode(amount, maxUses){
  const amt   = Math.max(0, Math.floor(Number(amount)||0));
  const uses  = _clampMaxUses(maxUses);
  const nonce = _b32nonce(8);
  const msg   = "HX3|" + amt + "|" + uses + "|" + nonce;
  const sig   = (await hmacSha256Hex(ACTIVATION_SECRET, msg)).slice(0, 10).toUpperCase();
  return "HX3-" + amt + "-" + uses + "-" + nonce + "-" + sig;
}

/* Local-only verify for HX3. Returns the parsed payload on success
   so the caller (shop.js → redeemGlobalCode) can decide whether to
   claim a slot against the shared bin. Never touches local state —
   the global counter does all the gating. */
async function verifyPublicActivationCodeFormat(code){
  const parts = String(code||"").trim().toUpperCase().split("-");
  if(parts.length !== 5 || parts[0] !== "HX3") return { ok:false, reason:"format" };
  const [, amtStr, usesStr, nonce, sig] = parts;
  const amt = parseInt(amtStr, 10);
  if(!isFinite(amt) || amt <= 0 || amt > 10_000_000) return { ok:false, reason:"amount" };
  const maxUses = parseInt(usesStr, 10);
  if(!isFinite(maxUses) || maxUses < 1 || maxUses > ACTIVATION_UNLIMITED) return { ok:false, reason:"amount" };
  const msg  = "HX3|" + amt + "|" + maxUses + "|" + nonce;
  const calc = (await hmacSha256Hex(ACTIVATION_SECRET, msg)).slice(0, 10).toUpperCase();
  if(calc !== sig) return { ok:false, reason:"bad-sig" };
  return { ok:true, amount: amt, maxUses, nonce };
}

/* { ok:true, amount, maxUses, used, remaining } on success,
   { ok:false, reason:".." } on failure.

   For HX3 codes the call delegates to redeemGlobalCode() in
   activations.js, which talks to the shared JSONBlob bin. For
   HX1/HX2 the legacy per-device counter in state.activationUsage
   stays in effect. */
async function verifyActivationCode(code, myId){
  const raw = String(code||"").trim().toUpperCase();
  /* HX3 — public, cross-device cap. */
  if(raw.startsWith("HX3-")){
    const parsed = await verifyPublicActivationCodeFormat(raw);
    if(!parsed.ok) return parsed;
    if(typeof redeemGlobalCode !== "function"){
      /* Defensive: activations.js should always be loaded alongside
         this script. If it isn't, fail closed rather than silently
         crediting without a global check. */
      return { ok:false, reason:"offline" };
    }
    return await redeemGlobalCode(parsed, String(myId||"").toUpperCase());
  }
  const parts = raw.split("-");
  let ver, tid, amtStr, usesStr, nonce, sig;
  if(parts.length === 6 && parts[0] === "HX2"){
    [ver, tid, amtStr, usesStr, nonce, sig] = parts;
  } else if(parts.length === 5 && parts[0] === "HX1"){
    [ver, tid, amtStr, nonce, sig] = parts;
    usesStr = "1";
  } else {
    return { ok:false, reason:"format" };
  }
  if(_strip(myId) !== tid) return { ok:false, reason:"wrong-id" };
  const amt = parseInt(amtStr, 10);
  if(!isFinite(amt) || amt <= 0 || amt > 10000000) return { ok:false, reason:"amount" };
  const maxUses = parseInt(usesStr, 10);
  if(!isFinite(maxUses) || maxUses < 1 || maxUses > ACTIVATION_UNLIMITED) return { ok:false, reason:"amount" };
  const msg = (ver === "HX2")
    ? ("HX2|" + tid + "|" + amt + "|" + maxUses + "|" + nonce)
    : ("HX1|" + tid + "|" + amt + "|" + nonce);
  const calc = (await hmacSha256Hex(ACTIVATION_SECRET, msg)).slice(0, 10).toUpperCase();
  if(calc !== sig) return { ok:false, reason:"bad-sig" };
  /* Per-nonce usage counter. A code is rejected once it hits maxUses.
     The legacy `usedActivationCodes` array stays in sync (full nonces
     are pushed onto it on the final redeem) so older code paths that
     read it for "have I seen this nonce?" still see consumed codes. */
  if(!state.usedActivationCodes) state.usedActivationCodes = [];
  if(!state.activationUsage || typeof state.activationUsage !== "object"){
    state.activationUsage = {};
    /* Migrate older single-use array: any nonce already on it counts
       as a fully-consumed HX1 redemption. */
    for(const n of state.usedActivationCodes){
      state.activationUsage[n] = 1;
    }
  }
  const used = state.activationUsage[nonce] | 0;
  if(used >= maxUses) return { ok:false, reason:"used" };
  state.activationUsage[nonce] = used + 1;
  const remaining = maxUses - (used + 1);
  if(remaining === 0 && state.usedActivationCodes.indexOf(nonce) < 0){
    state.usedActivationCodes.push(nonce);
  }
  return { ok:true, amount: amt, maxUses, used: used + 1, remaining, nonce };
}
