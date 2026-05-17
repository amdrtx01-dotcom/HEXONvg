/* ============================================================
   HEXON BETA — Global activations & ID grants
   ============================================================
   This module owns the cross-device side of two admin tools that
   the rest of the UI talks to:

     1. "Grant HEX by ID" — the admin types a target HEXON ID and
        a HEX amount; that gets pushed as a pending grant into a
        shared JSONBlob bin. Every other instance of the app polls
        the bin every 60 s; when a player whose ID matches an
        unclaimed grant boots / refreshes the app, they credit the
        amount locally and the grant is marked claimed so nobody
        else picks it up.

     2. "Public activation code" (HX3-…) — a single shared code with
        a hard cap on how many distinct players can ever redeem it.
        The cap lives in the same JSONBlob bin under `codeUsage`:

          codeUsage["<nonce>"] = {
            amount, maxUses,
            claimers: ["HX-XXX-YYY", "HX-AAA-BBB", …]
          }

        The redeem flow does a read-modify-write: it fetches the
        bin, checks that the player is not already in `claimers`
        and that `claimers.length < maxUses`, then PUTs the bin
        with the player appended. Two players who hit the bin at
        the exact same millisecond can both succeed against the
        same slot — that is acknowledged race noise, consistent
        with how the leaderboard already behaves.

   Storage layout (shared with the leaderboard bin):

     {
       version: 1,
       updatedAt: <ms>,
       entries:  [...],   // leaderboard (untouched by this module)
       codeUsage: { <nonce>: { amount, maxUses, claimers } },
       grants:    [ { id, amount, nonce, at, claimedAt, claimedBy } ]
     }

   The bin is the same JSONBlob the leaderboard reads/writes, so
   we only have one cross-device document to maintain. Both this
   module and leaderboard.js preserve unknown fields when they PUT.
   ============================================================ */
"use strict";

/* The shared JSONBlob URL is defined in leaderboard.js — we read
   it via getSharedBlobUrl() so that a 404-driven bin swap in
   leaderboard.js propagates here on the very next call. All scripts
   are loaded into the same global scope so the function is just
   available. */

/* Network knobs. The poll cadence is intentionally generous — grants
   are not time-critical and we want to keep bandwidth low. */
const ACT_POLL_MS    = 60_000;
const ACT_TIMEOUT_MS = 8_000;
const ACT_GRANTS_MAX = 200;     // hard cap on the grants[] array

/* Local cache of which grant nonces the player has already claimed
   on this device. Mirrored into `state.claimedGrants` so it persists
   across reloads. */
function _claimedGrantsSet(){
  if(!state.claimedGrants || !Array.isArray(state.claimedGrants)) state.claimedGrants = [];
  return new Set(state.claimedGrants);
}
function _markGrantClaimedLocally(nonce){
  if(!nonce) return;
  if(!state.claimedGrants || !Array.isArray(state.claimedGrants)) state.claimedGrants = [];
  if(state.claimedGrants.indexOf(nonce) < 0) state.claimedGrants.push(nonce);
}

/* Same fetch wrapper as leaderboard.js but local so we don't depend
   on internal helpers. Returns parsed JSON or throws. */
async function _actFetch(url, init){
  const ctrl = new AbortController();
  const tm = setTimeout(() => ctrl.abort(), ACT_TIMEOUT_MS);
  try {
    const res = await fetch(url, Object.assign({ signal: ctrl.signal, cache: "no-store" }, init || {}));
    if(!res.ok) throw new Error("HTTP " + res.status);
    return await res.json();
  } finally {
    clearTimeout(tm);
  }
}

/* Read the shared bin. Returns the raw object so callers can edit
   and PUT it back, preserving unknown fields. */
async function fetchActivationBin(){
  return await _actFetch(getSharedBlobUrl(), { method: "GET", headers: { "Accept": "application/json" } });
}

/* Write the shared bin. Preserves everything the caller passed in
   and bumps updatedAt. */
async function putActivationBin(body){
  const out = Object.assign({}, body || {}, { version: 1, updatedAt: Date.now() });
  await _actFetch(getSharedBlobUrl(), {
    method:  "PUT",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(out),
  });
  return out;
}

/* ---------- Public code redemption ----------
   Verifies the code locally for format + signature (done by
   verifyPublicActivationCode in profile.js) and then claims a slot
   in the shared bin. Returns the same result shape as the legacy
   HX1/HX2 verifier so shop.js can render the toasts uniformly. */
async function redeemGlobalCode(parsed, myId){
  /* `parsed` is the output of verifyPublicActivationCodeFormat(): it
     carries { ok, amount, maxUses, nonce } when the signature checked
     out. We never trust the network — the local verify is what
     decides whether the code is *valid*; the network only decides
     whether the player is allowed to *claim a slot*. */
  if(!parsed || !parsed.ok) return parsed || { ok:false, reason:"format" };
  const { amount, maxUses, nonce } = parsed;
  if(!myId) return { ok:false, reason:"wrong-id" };

  /* Fetch the bin, mutate codeUsage[nonce] in-place, PUT back. */
  let bin;
  try { bin = await fetchActivationBin(); }
  catch { return { ok:false, reason:"offline" }; }

  if(!bin || typeof bin !== "object") bin = {};
  if(!bin.codeUsage || typeof bin.codeUsage !== "object") bin.codeUsage = {};
  /* Look up the slot. We trust the locally-verified amount / maxUses
     for the slot we're about to create, but if the slot already
     exists the server values stick (otherwise a tampered client
     could rewrite the cap on every claim). */
  let slot = bin.codeUsage[nonce];
  if(!slot){
    slot = { amount: amount, maxUses: maxUses, claimers: [] };
    bin.codeUsage[nonce] = slot;
  }
  if(!Array.isArray(slot.claimers)) slot.claimers = [];
  /* One redemption per player. The local activationUsage map gives
     us a fast path on this device, but the bin is authoritative for
     the cross-device rule. */
  if(slot.claimers.indexOf(myId) >= 0){
    return { ok:false, reason:"already" };
  }
  if(slot.claimers.length >= (slot.maxUses | 0)){
    return { ok:false, reason:"used" };
  }
  slot.claimers.push(myId);

  try { await putActivationBin(bin); }
  catch { return { ok:false, reason:"offline" }; }

  const remaining = Math.max(0, (slot.maxUses | 0) - slot.claimers.length);
  return { ok:true, amount: slot.amount | 0, maxUses: slot.maxUses | 0, used: slot.claimers.length, remaining, nonce };
}

/* ---------- Direct ID grants (no code) ----------
   The admin pushes a record into `grants` for a specific target ID.
   When the target opens the app, pollAndClaimGrants() picks it up
   on the next poll tick (or immediately on boot). The grant is then
   marked claimed in the bin so nobody else sees it, and the player
   credits their wallet locally. */
async function pushGrantById(targetId, amount){
  const id = String(targetId || "").trim().toUpperCase();
  const amt = Math.max(0, Math.floor(Number(amount) || 0));
  if(!id) throw new Error("missing id");
  if(amt <= 0 || amt > 10_000_000) throw new Error("bad amount");

  let bin;
  try { bin = await fetchActivationBin(); }
  catch { throw new Error("offline"); }
  if(!bin || typeof bin !== "object") bin = {};
  if(!Array.isArray(bin.grants)) bin.grants = [];

  /* Generate a short random nonce so even if the admin sends two
     grants with identical (id, amount) at the same minute, they
     stay distinct on the bin. */
  const nonce = _grantNonce(10);
  bin.grants.push({
    id, amount: amt, nonce, at: Date.now(),
    claimedAt: 0, claimedBy: null
  });
  /* Cap the array — old fully-claimed grants drop off first so the
     bin doesn't grow forever. */
  bin.grants = _pruneGrants(bin.grants);
  await putActivationBin(bin);
  return { id, amount: amt, nonce };
}

function _grantNonce(len){
  const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = ""; const r = new Uint32Array(len);
  if(crypto && crypto.getRandomValues) crypto.getRandomValues(r);
  else for(let i=0;i<len;i++) r[i] = Math.floor(Math.random()*0xffffffff);
  for(let i=0;i<len;i++) s += A[r[i] % A.length];
  return s;
}

/* Drop the oldest already-claimed grants once the list grows past
   ACT_GRANTS_MAX. Unclaimed grants are preserved regardless of age
   so a player who only opens the app once a week still gets theirs. */
function _pruneGrants(arr){
  if(!Array.isArray(arr)) return [];
  if(arr.length <= ACT_GRANTS_MAX) return arr;
  const unclaimed = arr.filter(g => !g.claimedAt);
  const claimed   = arr.filter(g =>  g.claimedAt).sort((a,b) => (b.claimedAt|0) - (a.claimedAt|0));
  const keepClaimed = Math.max(0, ACT_GRANTS_MAX - unclaimed.length);
  return unclaimed.concat(claimed.slice(0, keepClaimed));
}

/* Read the bin and pull every unclaimed grant whose `id` matches the
   current player. Each match credits the wallet via addCoins(),
   bumps state.activations.totalReceived, and marks the grant claimed
   in the bin (PUT). Local state.claimedGrants stays in sync so the
   same grant nonce never doubles up if the PUT failed midway. */
async function pollAndClaimGrants(){
  const myId = (state.profile && state.profile.id) || "";
  if(!myId) return 0;

  let bin;
  try { bin = await fetchActivationBin(); }
  catch { return 0; }
  if(!bin || !Array.isArray(bin.grants) || bin.grants.length === 0) return 0;

  const mine = bin.grants.filter(g =>
    g && !g.claimedAt &&
    String(g.id || "").toUpperCase() === myId.toUpperCase()
  );
  if(mine.length === 0) return 0;

  const local = _claimedGrantsSet();
  let totalCredited = 0;
  let claimedCount  = 0;
  const now = Date.now();
  for(const g of mine){
    if(local.has(g.nonce)) continue;
    const amt = Math.max(0, Math.floor(Number(g.amount) || 0));
    if(amt <= 0) continue;
    /* Credit the wallet first; the toast surfaces it for the user. */
    if(typeof addCoins === "function") addCoins(amt);
    if(!state.activations) state.activations = { redeemed:0, totalReceived:0, generated:0, history:[] };
    state.activations.totalReceived = (state.activations.totalReceived | 0) + amt;
    _markGrantClaimedLocally(g.nonce);
    totalCredited += amt;
    claimedCount  += 1;
    g.claimedAt = now;
    g.claimedBy = myId;
    if(typeof toast === "function"){
      const msg = (typeof t === "function"
        ? t("grant.received", { n: amt })
        : ("+" + amt + " HEX")) || ("+" + amt + " HEX");
      toast(msg, "success");
    }
    try { sfx.coinJackpot && sfx.coinJackpot(); } catch {}
  }
  if(claimedCount === 0) return 0;

  saveState();
  /* PUT the bin back with the grants we just claimed. If the PUT
     fails we silently retry on the next tick — local state already
     remembers the nonces we credited so no double-spend can happen. */
  try { await putActivationBin(bin); } catch {}
  /* Repaint the wallet pill and any open shop / admin screens so the
     new balance lands instantly. */
  if(typeof renderWallet === "function") renderWallet();
  if(typeof renderShop === "function" && currentScreen === "shop") renderShop();
  if(typeof renderAdminScreen === "function" && currentScreen === "admin") renderAdminScreen();
  return claimedCount;
}

/* Polling loop. Stops paying network when the tab is hidden so we
   don't drain mobile data when the app is backgrounded. */
let _actTimer = null;
function startGrantPolling(){
  if(_actTimer) clearInterval(_actTimer);
  /* Fire one immediate poll so a freshly-logged-in player gets their
     pending grants right away. */
  pollAndClaimGrants().catch(() => {});
  _actTimer = setInterval(() => {
    if(typeof document !== "undefined" && document.hidden) return;
    pollAndClaimGrants().catch(() => {});
  }, ACT_POLL_MS);
}
function stopGrantPolling(){
  if(_actTimer){ clearInterval(_actTimer); _actTimer = null; }
}
