/* ============================================================
   HEXON BETA — Shop
   ============================================================
   The shop has four tabs:

     1. "Скини" — gallery of piece palettes (skins.js). Each card
        shows a 6-colour preview, a rarity badge (Стартова → Міфічна,
        see skins.js → RARITY_TIERS) and either:
          - "Користуватися" if the player owns it but it's not equipped,
          - "Активна" (disabled) if the player has it equipped,
          - "Купити N HEX" (with affordability state) otherwise.
        Buying deducts HEX coins, unlocks the skin, and auto-equips it.

     2. "Монети HEX" — 8 fixed bundles. Buying any bundle opens an
        in-game confirmation modal; confirming redirects to the admin's
        Telegram (@PloxoyHard) with a pre-filled order message so the
        player can pay externally. No in-app payments are made.

     3. "Бусти" — five one-shot consumable power-ups (shuffle, bomb,
        lightning, hint, skip). Buying increments state.boosts[id] by 1;
        spending happens inside the game from the booster bar above the
        board (scripts/boosts.js).

     4. "Активувати код" — paste a code received from the admin and
        instantly credit HEX to the wallet. Shows a running counter of
        codes the player has redeemed on this device.

   The shop UI is rebuilt from scratch every time the screen is entered
   so it always reflects the latest wallet/skins state.
   ============================================================ */
"use strict";

/* HEX-coin bundles. Order matters — UI follows this list top-to-bottom.
   `bonus` is a marketing tag rendered as a ribbon ("+5%", "+10%", …) so
   bigger bundles feel more attractive. No actual coins are deposited
   until the admin confirms the off-app payment. */
const COIN_BUNDLES = [
  { id:"b500",    amount:    500,  bonus:0  },
  { id:"b1000",   amount:   1000,  bonus:0  },
  { id:"b2000",   amount:   2000,  bonus:5  },
  { id:"b5000",   amount:   5000,  bonus:10 },
  { id:"b10000",  amount:  10000,  bonus:15 },
  { id:"b20000",  amount:  20000,  bonus:20 },
  { id:"b50000",  amount:  50000,  bonus:25 },
  { id:"b100000", amount: 100000,  bonus:35 },
];

/* Admin Telegram handle that bundle purchases redirect to. Hard-coded
   per user instructions — change in one place if it ever moves. */
const SHOP_TELEGRAM_HANDLE = "PloxoyHard";

let shopTab = "skins";        // "skins" | "coins" | "boosts" | "redeem"
let pendingBundleId = null;   // bundle awaiting confirmation in #modal-shop-confirm

function openShopScreen(){
  go("shop");
  renderShop();
  try { sfx.shopOpen && sfx.shopOpen(); } catch {}
}

function renderShop(){
  paintShopTabs();
  if(shopTab === "skins")       paintSkinGrid();
  else if(shopTab === "coins")  paintCoinGrid();
  else if(shopTab === "boosts") paintBoostGrid();
  else if(shopTab === "redeem") paintRedeemPane();
  renderWallet();
}

/* ---------------- Admin detection ----------------
   The "admin" role is granted to players whose nickname matches the
   constant ADMIN_NICKNAME (case-insensitive). The login flow in
   ui.js additionally enforces a fixed admin password before the
   profile is created, so an arbitrary user can't pick this nick. */
function isAdminUser(){
  const n = (state && state.profile && state.profile.nickname || "").trim().toLowerCase();
  return n === ADMIN_NICKNAME;
}

/* ---------- Activation-code redeem pane (in shop) ---------- */
function paintRedeemPane(){
  const countEl = document.getElementById("redeem-count");
  const totalEl = document.getElementById("redeem-total");
  if(countEl) countEl.textContent = formatCoins(redeemedCodesCount());
  if(totalEl) totalEl.textContent = formatCoins(redeemedCodesTotal()) + " HEX";
  wireActivationRedeemCard();
}

/* The DOM for the redeem card lives in index.html so it can be styled
   from the static stylesheet. Here we only wire the button — and we
   guard against double-binding so re-renders don't pile up listeners. */
function wireActivationRedeemCard(){
  const btn = document.getElementById("redeem-code-btn");
  const inp = document.getElementById("redeem-code-input");
  if(!btn || !inp) return;
  if(btn.dataset.wired === "1") return;
  btn.dataset.wired = "1";
  /* Guard against double-firing while the verify HMAC is in-flight.
     A jittery double-tap on the Activate button was the only way
     left to *almost* race two redemptions of the same multi-use
     code; the flag below makes that impossible. */
  let inFlight = false;
  btn.addEventListener("click", async () => {
    if(inFlight) return;
    const code = (inp.value || "").trim();
    if(!code) return;
    inFlight = true;
    btn.disabled = true;
    let r;
    try {
      r = await verifyActivationCode(code, state.profile.id || "");
    } finally {
      inFlight = false;
      btn.disabled = false;
    }
    if(!r.ok){
      const reasonMsg = {
        "format":   t("redeem.err.format")   || "Неправильний формат коду",
        "wrong-id": t("redeem.err.wrong-id") || "Код не для вашого ID",
        "amount":   t("redeem.err.amount")   || "Невірна сума",
        "bad-sig":  t("redeem.err.bad-sig")  || "Код підроблений або змінений",
        "used":     t("redeem.err.used")     || "Ліміт активацій коду вичерпано",
        "already":  t("redeem.err.already")  || "Ви вже активували цей код",
        "offline":  t("redeem.err.offline")  || "Немає інтернету для перевірки коду"
      }[r.reason] || (t("redeem.err.generic") || "Помилка");
      toast(reasonMsg, "error");
      try { sfx.error && sfx.error(); } catch {}
      return;
    }
    addCoins(r.amount);
    /* Persistent counter for the player. The verify call already pushed
       the nonce onto state.usedActivationCodes; the totals below mirror
       that list for fast read access on the shop & admin screens. */
    if(!state.activations) state.activations = { redeemed:0, totalReceived:0, generated:0 };
    state.activations.redeemed      = (state.activations.redeemed | 0) + 1;
    state.activations.totalReceived = (state.activations.totalReceived | 0) + r.amount;
    saveState();
    /* If the code still has redemptions left (multi-use codes), tell
       the player how many remain so they can use it again later.
       Otherwise stick with the classic single-success toast. */
    const baseMsg = (t("redeem.ok") || "+{n} HEX зараховано").replace("{n}", r.amount);
    if (r.remaining && r.remaining > 0){
      const tailKey = (r.remaining === 1) ? "redeem.remaining.one" : "redeem.remaining.many";
      const tail = (t(tailKey, { n: r.remaining }) || ("(" + r.remaining + " left)"));
      toast(baseMsg + " · " + tail, "success");
    } else {
      toast(baseMsg, "success");
    }
    inp.value = "";
    try { sfx.coinUp && sfx.coinUp(); } catch {}
    paintRedeemPane();
  });
}

/* Helpers for the activation counters used by both the shop and the
   admin screen. We prefer the explicit counter when available and fall
   back to the length of usedActivationCodes for older saves. */
function redeemedCodesCount(){
  if(state.activations && Number.isFinite(state.activations.redeemed)) return state.activations.redeemed | 0;
  return (state.usedActivationCodes || []).length | 0;
}
function redeemedCodesTotal(){
  if(state.activations && Number.isFinite(state.activations.totalReceived)) return state.activations.totalReceived | 0;
  return 0;
}
function generatedCodesCount(){
  if(state.activations && Number.isFinite(state.activations.generated)) return state.activations.generated | 0;
  return 0;
}

function paintShopTabs(){
  document.querySelectorAll(".shop-tab").forEach(t => {
    t.classList.toggle("on", t.dataset.tab === shopTab);
  });
  const skinsPane  = document.getElementById("shop-pane-skins");
  const coinsPane  = document.getElementById("shop-pane-coins");
  const boostsPane = document.getElementById("shop-pane-boosts");
  const redeemPane = document.getElementById("shop-pane-redeem");
  if(skinsPane)  skinsPane.classList.toggle("hidden",  shopTab !== "skins");
  if(coinsPane)  coinsPane.classList.toggle("hidden",  shopTab !== "coins");
  if(boostsPane) boostsPane.classList.toggle("hidden", shopTab !== "boosts");
  if(redeemPane) redeemPane.classList.toggle("hidden", shopTab !== "redeem");
}

/* ---------------- Skins tab ---------------- */
function paintSkinGrid(){
  const grid = document.getElementById("shop-skin-grid");
  if(!grid) return;
  grid.innerHTML = "";
  const equipped = currentSkinId();
  SHOP_SKIN_ORDER.forEach(id => {
    const skin = SKINS[id];
    if(!skin) return;
    const owned = isSkinUnlocked(id);
    const isEquipped = (id === equipped);
    /* Rarity descriptor drives the badge label + the card's glow
       border. We poke the colour in via --rarity-color so the
       stylesheet doesn't have to know about every tier. */
    const rarity = (typeof skinRarity === "function") ? skinRarity(id) : null;
    const card = document.createElement("div");
    card.className = "shop-card skin-card" + (isEquipped ? " is-equipped" : owned ? " is-owned" : "");
    if(rarity) card.classList.add("rarity-" + rarity.id);
    card.style.setProperty("--card-accent", skin.accent);
    if(rarity) card.style.setProperty("--rarity-color", rarity.accent);

    if(rarity){
      /* Top-right badge — short label ("Рідкісна" / "Міфічна" …)
         in the tier's accent colour. Localised via i18n.js. */
      const badge = document.createElement("span");
      badge.className = "skin-rarity-badge";
      const key = "rarity." + rarity.id;
      badge.textContent = (typeof t === "function" ? t(key) : null) || rarity.label;
      card.appendChild(badge);
    }

    /* Unique per-skin icon. The glyph itself is built in skins.js
       and inherits colours from the palette so no two skins look
       alike. We host it on a tinted glass disc so the icon reads
       clearly on top of bright palettes too. */
    const iconWrap = document.createElement("div");
    iconWrap.className = "skin-icon";
    iconWrap.innerHTML = (typeof skinIconSvg === "function") ? skinIconSvg(id) : "";

    /* Preview swatch — a 3x2 grid of cells coloured from this skin. */
    const swatch = document.createElement("div");
    swatch.className = "skin-swatch";
    for(let i=0;i<6;i++){
      const cell = document.createElement("div");
      cell.className = "skin-swatch-cell";
      cell.style.background = skin.palette[i] || skin.palette[0];
      swatch.appendChild(cell);
    }

    const name = document.createElement("div");
    name.className = "skin-name";
    name.textContent = skin.name;

    const cta = document.createElement("button");
    cta.className = "btn shop-cta";
    if(isEquipped){
      cta.textContent = (typeof t === "function" ? t("shop.skin.active") : "Active");
      cta.classList.add("btn-ghost");
      cta.disabled = true;
    } else if(owned){
      cta.textContent = (typeof t === "function" ? t("shop.skin.equip") : "Equip");
      cta.classList.add("btn-primary");
      cta.addEventListener("click", () => {
        if(equipSkin(id)){
          saveState();
          try { sfx.shopEquip && sfx.shopEquip(); } catch {}
          toast((typeof t === "function" ? t("shop.skin.equipped", { name: skin.name }) : skin.name + " equipped"), "success");
          renderShop();
        }
      });
    } else {
      const can = getCoins() >= skin.price;
      cta.textContent = formatCoins(skin.price) + " HEX";
      cta.classList.add(can ? "btn-primary" : "btn-disabled");
      cta.disabled = !can;
      cta.addEventListener("click", () => {
        if(!spendCoins(skin.price)){
          toast((typeof t === "function" ? t("shop.skin.poor") : "Not enough HEX"), "warn");
          return;
        }
        unlockSkin(id);
        equipSkin(id);
        saveState();
        try { sfx.shopEquip && sfx.shopEquip(); } catch {}
        toast((typeof t === "function" ? t("shop.skin.bought", { name: skin.name }) : "Bought " + skin.name), "success");
        renderShop();
      });
    }

    card.appendChild(swatch);
    card.appendChild(name);
    card.appendChild(cta);
    grid.appendChild(card);
  });
}

/* ---------------- Boosts tab ----------------
   Five one-shot consumable power-ups. The order here is also the
   order in which they appear in the in-game booster bar (boosts.js).
   Prices were picked so the cheapest (hint) is affordable after a
   few runs and the most expensive (lightning) is a real splurge. */
const BOOST_CATALOGUE = [
  { id:"shuffle",   icon:"#i-shuffle", price:300, accent:"#24bdff" },
  { id:"bomb",      icon:"#i-bomb",    price:600, accent:"#ff7a59" },
  { id:"lightning", icon:"#i-light",   price:900, accent:"#ffe066" },
  { id:"hint",      icon:"#i-hint",    price:200, accent:"#3ddc97" },
  { id:"skip",      icon:"#i-skip",    price:500, accent:"#a766ff" },
];

function paintBoostGrid(){
  const grid = document.getElementById("shop-boost-grid");
  if(!grid) return;
  grid.innerHTML = "";
  const bag = (state && state.boosts) || {};
  BOOST_CATALOGUE.forEach(item => {
    const card = document.createElement("div");
    card.className = "shop-card boost-card boost-" + item.id;
    card.style.setProperty("--card-accent", item.accent);

    /* Big icon on a tinted disc — matches the visual rhythm of
       skin-icon so the two grids feel like one family. */
    const iconWrap = document.createElement("div");
    iconWrap.className = "boost-icon";
    iconWrap.innerHTML = '<svg class="ic-svg lg"><use href="' + item.icon + '"/></svg>';

    const name = document.createElement("div");
    name.className = "boost-name";
    name.textContent = (typeof t === "function" ? t("boost." + item.id + ".name") : null) || item.id;

    const desc = document.createElement("div");
    desc.className = "boost-desc";
    desc.textContent = (typeof t === "function" ? t("boost." + item.id + ".desc") : null) || "";

    const have = document.createElement("div");
    have.className = "boost-have";
    have.innerHTML = '<span class="boost-have-lbl">'
      + ((typeof t === "function" ? t("shop.boost.have") : null) || "You own:")
      + '</span> <b>' + (bag[item.id] | 0) + '</b>';

    const can = getCoins() >= item.price;
    const cta = document.createElement("button");
    cta.className = "btn shop-cta " + (can ? "btn-primary" : "btn-disabled");
    cta.disabled = !can;
    cta.textContent = ((typeof t === "function" ? t("shop.boost.buy", { n: formatCoins(item.price) }) : null)
                       || ("Buy " + formatCoins(item.price) + " HEX"));
    cta.addEventListener("click", () => {
      if(!spendCoins(item.price)){
        toast(((typeof t === "function" ? t("shop.boost.poor") : null) || "Not enough HEX"), "warn");
        return;
      }
      if(!state.boosts) state.boosts = { shuffle:0, bomb:0, lightning:0, hint:0, skip:0 };
      state.boosts[item.id] = (state.boosts[item.id] | 0) + 1;
      saveState();
      try { sfx.shopEquip && sfx.shopEquip(); } catch {}
      const nameStr = (typeof t === "function" ? t("boost." + item.id + ".name") : null) || item.id;
      toast(((typeof t === "function" ? t("shop.boost.bought", { name: nameStr }) : null)
             || ("+1 " + nameStr)), "success");
      /* Refresh the in-game booster bar in case the player is
         mid-run and the shop opened from somewhere else. The bar
         tolerates being repainted from any screen. */
      if(typeof renderBoosterBar === "function") renderBoosterBar();
      renderShop();
    });

    card.appendChild(iconWrap);
    card.appendChild(name);
    card.appendChild(desc);
    card.appendChild(have);
    card.appendChild(cta);
    grid.appendChild(card);
  });
}

/* ---------------- Coins tab ---------------- */
function paintCoinGrid(){
  const grid = document.getElementById("shop-coin-grid");
  if(!grid) return;
  grid.innerHTML = "";
  COIN_BUNDLES.forEach(b => {
    const card = document.createElement("div");
    card.className = "shop-card coin-card";
    if(b.bonus >= 20) card.classList.add("popular");
    if(b.bonus >= 30) card.classList.add("best-value");

    const stack = document.createElement("div");
    stack.className = "coin-card-stack";
    stack.innerHTML = '<svg viewBox="0 0 24 24" class="coin-card-icon">'
      + '<circle cx="12" cy="12" r="10" fill="url(#coin-grad)" stroke="rgba(255,180,84,.6)" stroke-width="1.2"/>'
      + '<text x="12" y="16" text-anchor="middle" font-family="Inter,sans-serif" font-size="10" font-weight="700" fill="#0b0f1a">H</text>'
      + '</svg>';

    const amount = document.createElement("div");
    amount.className = "coin-card-amount";
    amount.innerHTML = '<b>' + b.amount.toLocaleString("uk-UA") + '</b> <span>HEX</span>';

    if(b.bonus > 0){
      const ribbon = document.createElement("div");
      ribbon.className = "coin-card-ribbon";
      ribbon.textContent = "+" + b.bonus + "%";
      card.appendChild(ribbon);
    }

    const cta = document.createElement("button");
    cta.className = "btn btn-primary shop-cta";
    cta.innerHTML = '<svg class="ic-svg"><use href="#i-tg"/></svg><span>'
      + (typeof t === "function" ? t("shop.buy") : "Buy")
      + '</span>';
    cta.addEventListener("click", () => openBundleConfirm(b.id));

    card.appendChild(stack);
    card.appendChild(amount);
    card.appendChild(cta);
    grid.appendChild(card);
  });
}

/* ---------------- Bundle purchase flow ---------------- */
function openBundleConfirm(bundleId){
  const b = COIN_BUNDLES.find(x => x.id === bundleId);
  if(!b) return;
  pendingBundleId = bundleId;
  const amountEl = document.getElementById("shop-confirm-amount");
  if(amountEl) amountEl.textContent = b.amount.toLocaleString("uk-UA") + " HEX";
  const idEl = document.getElementById("shop-confirm-id");
  if(idEl) idEl.textContent = (state.profile && state.profile.id) || "—";
  const handleEl = document.getElementById("shop-confirm-handle");
  if(handleEl) handleEl.textContent = "@" + SHOP_TELEGRAM_HANDLE;
  openModal("#modal-shop-confirm");
}

function confirmBundlePurchase(){
  const b = COIN_BUNDLES.find(x => x.id === pendingBundleId);
  closeModal("#modal-shop-confirm");
  if(!b){ pendingBundleId = null; return; }
  const playerId = (state.profile && state.profile.id) || "unknown";
  const nick     = (state.profile && state.profile.nickname) || "Player";
  /* Pre-filled Telegram message so the admin sees exactly what to top up. */
  const msg = "Привіт! Хочу купити " + b.amount.toLocaleString("uk-UA")
            + " HEX за HEXON. Мій ID: " + playerId
            + " (нік: " + nick + ").";
  const url = "https://t.me/" + SHOP_TELEGRAM_HANDLE + "?text=" + encodeURIComponent(msg);
  /* MainActivity intercepts every https:// link and hands it to the
     system browser / Telegram app via ACTION_VIEW. In a normal browser
     this opens a new tab. */
  try { window.open(url, "_blank", "noopener"); }
  catch { window.location.href = url; }
  toast((typeof t === "function" ? t("shop.bundle.redirecting") : "Opening Telegram…"), "info");
  pendingBundleId = null;
}

function cancelBundlePurchase(){
  pendingBundleId = null;
  closeModal("#modal-shop-confirm");
}

/* ---------------- Wiring ---------------- */
function initShopWiring(){
  /* Tab switches. */
  document.querySelectorAll(".shop-tab").forEach(t => {
    t.addEventListener("click", () => {
      shopTab = t.dataset.tab || "skins";
      renderShop();
    });
  });

  /* Daily reward pill on the menu screen. */
  const daily = document.getElementById("daily-reward-pill");
  if(daily){
    daily.addEventListener("click", () => {
      const r = claimDailyReward();
      if(!r.ok){
        toast((typeof t === "function" ? t("daily.not-ready") : "Come back at 11:00"), "warn");
        return;
      }
      try { sfx.coinJackpot && sfx.coinJackpot(); } catch {}
      toast((typeof t === "function"
              ? t("daily.claimed", { n: r.amount })
              : ("+" + r.amount + " HEX")),
            "success");
      if(window.fx && typeof fx.celebrateLevelUp === "function"){
        /* Reuse the level-up confetti for the daily reward — it's a
           celebratory beat too. */
        fx.celebrateLevelUp(r.amount);
      }
      renderWallet();
    });
  }

  /* Bundle confirmation modal. */
  const yes = document.getElementById("shop-confirm-yes");
  const no  = document.getElementById("shop-confirm-no");
  if(yes) yes.addEventListener("click", confirmBundlePurchase);
  if(no)  no.addEventListener("click",  cancelBundlePurchase);
  const back = document.getElementById("modal-shop-confirm");
  if(back) back.addEventListener("click", e => {
    if(e.target.id === "modal-shop-confirm") cancelBundlePurchase();
  });

  /* Menu tile. */
  const tile = document.getElementById("menu-shop");
  if(tile) tile.addEventListener("click", openShopScreen);

  applySkinAccent();
}
