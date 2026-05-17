/* ============================================================
   HEXON BETA — Changelog
   ============================================================
   Single source of truth for the "What's new" modal triggered by
   the sparkle button on the menu screen, just above the Play tile.

   Versions are listed newest-first. Each `items` is an array of
   i18n string keys; the string itself lives in scripts/i18n.js so
   localisation works without touching this file. If a key is missing
   in the current language we render the literal key, which makes
   missing translations obvious in QA. Items rendered as <li>.

   We persist the latest-seen build in localStorage so the sparkle
   button can pulse a tiny dot when there's a newer version than the
   one the player last opened. Storage key: `hex_whatsnew_seen_v1`.
   ============================================================ */
"use strict";

const CHANGELOG_LS_KEY = "hex_whatsnew_seen_v1";

const CHANGELOG = [
  {
    version: "1.5",
    date:    "2026-05-17",
    titleKey: "whatsnew.v15.title",
    items: [
      "whatsnew.v15.tournaments",
      "whatsnew.v15.whatsnew",
      "whatsnew.v15.adminhide",
      "whatsnew.v15.lbonline",
      "whatsnew.v15.softersound",
    ],
  },
  {
    version: "1.4",
    date:    "2026-05-16",
    titleKey: "whatsnew.v14.title",
    items: [
      "whatsnew.v14.lbselfheal",
      "whatsnew.v14.boosts",
      "whatsnew.v14.rarity",
      "whatsnew.v14.softersound",
      "whatsnew.v14.perf",
    ],
  },
  {
    version: "1.3",
    date:    "2026-05-15",
    titleKey: "whatsnew.v13.title",
    items: [
      "whatsnew.v13.cors",
      "whatsnew.v13.shopfix",
      "whatsnew.v13.scorefix",
      "whatsnew.v13.profilefix",
    ],
  },
];

/* The latest version string (top of the list) decides whether the
   pulse dot is shown next to the sparkle button. */
function latestChangelogVersion(){
  return (CHANGELOG[0] && CHANGELOG[0].version) || "";
}

function hasUnseenChangelog(){
  try {
    const seen = localStorage.getItem(CHANGELOG_LS_KEY) || "";
    return seen !== latestChangelogVersion();
  } catch { return true; }
}

function markChangelogSeen(){
  try { localStorage.setItem(CHANGELOG_LS_KEY, latestChangelogVersion()); } catch {}
  const dot = document.getElementById("whatsnew-dot");
  if(dot) dot.classList.add("hidden");
}

function _whatsnewT(key){
  if(typeof t === "function"){
    const v = t(key);
    if(v && v !== key) return v;
  }
  return null;
}

function renderWhatsnewModal(){
  const body = document.getElementById("whatsnew-body");
  if(!body) return;
  body.innerHTML = "";
  CHANGELOG.forEach((entry, i) => {
    const section = document.createElement("section");
    section.className = "whatsnew-section" + (i === 0 ? " is-latest" : "");
    /* Stagger the entry animation so each version block fades in
       sequentially — keeps the modal feeling polished. */
    section.style.animationDelay = (60 * i) + "ms";

    const head = document.createElement("div");
    head.className = "whatsnew-head";
    const ver = document.createElement("span");
    ver.className = "whatsnew-version";
    ver.textContent = "v" + entry.version;
    const tag = document.createElement("span");
    tag.className = "whatsnew-tag";
    tag.textContent = _whatsnewT(entry.titleKey) || entry.version;
    const date = document.createElement("span");
    date.className = "whatsnew-date";
    date.textContent = entry.date || "";
    head.appendChild(ver);
    head.appendChild(tag);
    head.appendChild(date);
    section.appendChild(head);

    const ul = document.createElement("ul");
    ul.className = "whatsnew-list";
    entry.items.forEach((key, j) => {
      const li = document.createElement("li");
      li.className = "whatsnew-item";
      li.style.animationDelay = (60 * i + 40 * j + 80) + "ms";
      const icon = document.createElement("svg");
      icon.setAttribute("class", "ic-svg whatsnew-bullet");
      icon.innerHTML = '<use href="#i-sparkle"/>';
      const txt = document.createElement("span");
      txt.textContent = _whatsnewT(key) || key;
      li.appendChild(icon);
      li.appendChild(txt);
      ul.appendChild(li);
    });
    section.appendChild(ul);
    body.appendChild(section);
  });
}

function openWhatsnewModal(){
  renderWhatsnewModal();
  if(typeof openModal === "function") openModal("#modal-whatsnew");
  else {
    const m = document.getElementById("modal-whatsnew");
    if(m) m.classList.add("open");
  }
  markChangelogSeen();
}

function closeWhatsnewModal(){
  if(typeof closeModal === "function") closeModal("#modal-whatsnew");
  else {
    const m = document.getElementById("modal-whatsnew");
    if(m) m.classList.remove("open");
  }
}

/* Wires the sparkle button + the close handlers. Idempotent — safe
   to call multiple times. */
function wireWhatsnewControls(){
  const btn = document.getElementById("whatsnew-btn");
  if(btn && btn.dataset.wired !== "1"){
    btn.dataset.wired = "1";
    btn.addEventListener("click", openWhatsnewModal);
    /* Show the pulse dot only if the player hasn't seen this build's
       changelog yet. */
    const dot = document.getElementById("whatsnew-dot");
    if(dot) dot.classList.toggle("hidden", !hasUnseenChangelog());
  }
  const close = document.getElementById("whatsnew-close");
  if(close && close.dataset.wired !== "1"){
    close.dataset.wired = "1";
    close.addEventListener("click", closeWhatsnewModal);
  }
  const back = document.getElementById("modal-whatsnew");
  if(back && back.dataset.wired !== "1"){
    back.dataset.wired = "1";
    back.addEventListener("click", e => {
      /* Click-outside-the-card to dismiss, matches the other modals. */
      if(e.target === back) closeWhatsnewModal();
    });
  }
}
