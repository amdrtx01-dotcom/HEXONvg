/* ============================================================
   HEXON BETA — HEX coin wallet & daily reward
   ============================================================
   `state.wallet.coins`         spendable balance.
   `state.wallet.lastDailyClaim` unix ms of the last daily claim.

   The daily reward is gated on two conditions:
     1. The current local time is at or after 11:00 today.
     2. The last claim's local date is strictly before today.
   When both hold, the player may claim once and receive a random
   integer between 10 and 5000 HEX (uniform).

   Public API:
     getCoins(), addCoins(n[, opts]), spendCoins(n)
     dailyRewardStatus()  -> { state: "available" | "claimed-today" |
                               "waiting-11", availableAt: Date,
                               nowAfter11: bool }
     claimDailyReward()   -> { ok: bool, amount?: number, reason?: str }
     renderWallet()       -> repaint HUD + shop pills
   ============================================================ */
"use strict";

const DAILY_HOUR = 11;
const DAILY_MIN_REWARD = 10;
const DAILY_MAX_REWARD = 5000;

function getCoins(){
  if(!state.wallet) state.wallet = { coins:0, lastDailyClaim:0 };
  return state.wallet.coins | 0;
}

/* Increment the balance and (optionally) animate a "+N" pop on the
   HUD coin pill. We round to integer because all in-game prices are
   whole HEX and players shouldn't see fractional balances. */
function addCoins(n, opts){
  if(!Number.isFinite(n)) return;
  if(!state.wallet) state.wallet = { coins:0, lastDailyClaim:0 };
  const amount = Math.max(0, Math.round(n));
  if(amount <= 0) return;
  state.wallet.coins = getCoins() + amount;
  /* Coalesced — both addCoins / spendCoins are routinely chained
     with other state mutations (daily reward, redeem, booster
     purchase, line-clear bonus) and used to write to disk twice. */
  requestSaveState();
  renderWallet();
  if(opts && opts.silent) return;
  popCoinDelta(+amount);
  try { sfx.coinUp && sfx.coinUp(); } catch {}
}

function spendCoins(n){
  if(!Number.isFinite(n) || n <= 0) return false;
  const amount = Math.round(n);
  if(getCoins() < amount) return false;
  state.wallet.coins -= amount;
  requestSaveState();
  renderWallet();
  popCoinDelta(-amount);
  try { sfx.coinSpend && sfx.coinSpend(); } catch {}
  return true;
}

/* Time helpers. We compare *local* calendar dates so a player in any
   timezone gets exactly one claim per local day at/after 11:00. */
function _todayAt11(){
  const d = new Date();
  d.setHours(DAILY_HOUR, 0, 0, 0);
  return d;
}
function _localDateKey(ts){
  const d = ts ? new Date(ts) : new Date();
  return d.getFullYear() + "-" + (d.getMonth()+1) + "-" + d.getDate();
}

function dailyRewardStatus(){
  const now = new Date();
  const at11 = _todayAt11();
  const last = state.wallet && state.wallet.lastDailyClaim || 0;
  const claimedToday = last && (_localDateKey(last) === _localDateKey(now));
  if(now >= at11){
    if(claimedToday) return { state:"claimed-today", availableAt: _nextAvailability(), nowAfter11:true };
    return { state:"available", availableAt: at11, nowAfter11:true };
  }
  return { state:"waiting-11", availableAt: at11, nowAfter11:false };
}
function _nextAvailability(){
  const d = _todayAt11();
  d.setDate(d.getDate() + 1);
  return d;
}

function claimDailyReward(){
  const status = dailyRewardStatus();
  if(status.state !== "available"){
    return { ok:false, reason: status.state };
  }
  const span = DAILY_MAX_REWARD - DAILY_MIN_REWARD + 1;
  const amount = DAILY_MIN_REWARD + Math.floor(Math.random() * span);
  if(!state.wallet) state.wallet = { coins:0, lastDailyClaim:0 };
  state.wallet.lastDailyClaim = Date.now();
  /* `addCoins` saves + animates the HUD pill; we mark the claim
     timestamp first so the persisted state already reflects it. */
  addCoins(amount, { silent:false });
  return { ok:true, amount };
}

/* ------------ HUD rendering ------------ */
function _coinPill(){ return document.getElementById("hex-coin-pill"); }
function _coinPillValue(){ return document.getElementById("hex-coin-amount"); }
function renderWallet(){
  const v = _coinPillValue();
  if(v) v.textContent = formatCoins(getCoins());
  const head = document.getElementById("shop-head-amount");
  if(head) head.textContent = formatCoins(getCoins());
  /* daily pill on the menu */
  const daily = document.getElementById("daily-reward-pill");
  if(daily){
    const st = dailyRewardStatus();
    daily.classList.toggle("daily-ready", st.state === "available");
    daily.classList.toggle("daily-locked", st.state !== "available");
    const lbl = daily.querySelector(".daily-cta");
    if(lbl) lbl.textContent = (st.state === "available")
      ? (typeof t === "function" ? t("daily.claim") : "Claim")
      : (st.state === "waiting-11" ? _hhmmCountdown(st.availableAt) : _hhmmCountdown(_nextAvailability()));
  }
  /* When the shop is the active screen, repaint the active grid so
     Buy buttons reflect the latest balance (enabled / disabled). The
     paint functions don't call renderWallet, so there's no recursion.
     Screen visibility is driven by the `.active` class in CSS, not the
     HTML `hidden` attribute, so we read `currentScreen` (set by go()
     in ui.js) the same way activations.js does. */
  if(typeof currentScreen !== "undefined" && currentScreen === "shop"){
    if(typeof shopTab !== "undefined" && shopTab === "coins" && typeof paintCoinGrid === "function") paintCoinGrid();
    else if(typeof paintSkinGrid === "function") paintSkinGrid();
  }
}

/* Click the HEX coin pill to jump straight to the shop. Attached
   once on first call so it survives re-renders. */
function _wireCoinPill(){
  const pill = _coinPill();
  if(!pill || pill.dataset.wired === "1") return;
  pill.dataset.wired = "1";
  pill.addEventListener("click", () => {
    if(typeof openShopScreen === "function") openShopScreen();
    else if(typeof go === "function") go("shop");
  });
}
setTimeout(_wireCoinPill, 0);
function formatCoins(n){
  n = Math.max(0, Math.round(n||0));
  if(n >= 1_000_000) return (n/1_000_000).toFixed(n%1_000_000===0?0:1) + "M";
  if(n >= 10_000)    return (n/1000).toFixed(n%1000===0?0:1) + "K";
  return String(n);
}
function _hhmmCountdown(when){
  if(!when) return "—";
  const ms = when.getTime() - Date.now();
  if(ms <= 0) return "00:00";
  const h = Math.floor(ms/3600_000);
  const m = Math.floor((ms%3600_000)/60_000);
  return (h<10?"0":"")+h+":"+(m<10?"0":"")+m;
}

/* Pop a "+N HEX" / "-N HEX" delta above the coin pill. Pure CSS
   animation; the element removes itself when the transition ends. */
function popCoinDelta(delta){
  const pill = _coinPill();
  if(!pill) return;
  const el = document.createElement("div");
  el.className = "coin-delta " + (delta >= 0 ? "coin-delta-up" : "coin-delta-down");
  el.textContent = (delta >= 0 ? "+" : "-") + formatCoins(Math.abs(delta)) + " HEX";
  pill.appendChild(el);
  setTimeout(() => el.remove(), 1400);
}

/* Tick the countdown labels every 30 s so the menu pill stays fresh
   even if the player sits on the screen. We deliberately skip the
   tick when the tab is hidden (no point repainting an invisible HUD)
   and when the player is in-game, where renderWallet() also re-paints
   the shop grid and was a measurable contributor to mid-drag jank. */
setInterval(() => {
  if(document.hidden) return;
  if(typeof currentScreen !== "undefined" && currentScreen === "game") return;
  if(document.getElementById("daily-reward-pill")) renderWallet();
}, 30_000);
