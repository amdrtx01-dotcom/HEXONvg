/* ============================================================
   HEXON BETA — custom glass language dropdown
   ============================================================ */
"use strict";

const LANGS = [
  { code: "uk", label: "Українська" },
  { code: "en", label: "English"    },
  { code: "ru", label: "Русский"    },
  { code: "cs", label: "Čeština"    },
  { code: "pl", label: "Polski"     },
  { code: "de", label: "Deutsch"    },
  { code: "fr", label: "Français"   },
  { code: "es", label: "Español"    },
  { code: "it", label: "Italiano"   },
  { code: "pt", label: "Português"  },
  { code: "tr", label: "Türkçe"     },
  { code: "ja", label: "日本語"      },
  { code: "ko", label: "한국어"       },
  { code: "zh", label: "中文"        },
  { code: "ar", label: "العربية"     },
  { code: "nl", label: "Nederlands" },
  { code: "ro", label: "Română"     },
  { code: "hu", label: "Magyar"     },
];

/* Tiny inline SVG flags. We store the literal SVG markup and
   convert it to a data URI at use-time so we never have to worry
   about quoting inside style attributes. Colors are simplified
   tri/bi-bands so they encode small and decode crisply at 22×16. */
const FLAG_SVGS = {
  uk: "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 4 3'><rect width='4' height='3' fill='%23005bbb'/><rect y='1.5' width='4' height='1.5' fill='%23ffd500'/></svg>",
  en: "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 60 30'><clipPath id='a'><rect width='60' height='30'/></clipPath><path d='M0,0 v30 h60 v-30 z' fill='%23012169'/><path d='M0,0 L60,30 M60,0 L0,30' stroke='%23fff' stroke-width='6'/><path d='M0,0 L60,30 M60,0 L0,30' clip-path='url(%23a)' stroke='%23C8102E' stroke-width='4'/><path d='M30,0 v30 M0,15 h60' stroke='%23fff' stroke-width='10'/><path d='M30,0 v30 M0,15 h60' stroke='%23C8102E' stroke-width='6'/></svg>",
  ru: "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 3 2'><rect width='3' height='2' fill='%23fff'/><rect y='0.67' width='3' height='0.67' fill='%230039A6'/><rect y='1.33' width='3' height='0.67' fill='%23D52B1E'/></svg>",
  cs: "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 6 4'><rect width='6' height='2' fill='%23fff'/><rect y='2' width='6' height='2' fill='%23D7141A'/><polygon points='0,0 3,2 0,4' fill='%2311457E'/></svg>",
  pl: "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 8 5'><rect width='8' height='5' fill='%23fff'/><rect y='2.5' width='8' height='2.5' fill='%23dc143c'/></svg>",
  de: "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 5 3'><rect width='5' height='1' fill='%23000'/><rect y='1' width='5' height='1' fill='%23DD0000'/><rect y='2' width='5' height='1' fill='%23FFCE00'/></svg>",
  fr: "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 3 2'><rect width='1' height='2' fill='%23002395'/><rect x='1' width='1' height='2' fill='%23fff'/><rect x='2' width='1' height='2' fill='%23ED2939'/></svg>",
  es: "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 3 2'><rect width='3' height='2' fill='%23AA151B'/><rect y='0.5' width='3' height='1' fill='%23F1BF00'/></svg>",
  it: "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 3 2'><rect width='1' height='2' fill='%23009246'/><rect x='1' width='1' height='2' fill='%23fff'/><rect x='2' width='1' height='2' fill='%23CE2B37'/></svg>",
  pt: "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 5 3'><rect width='2' height='3' fill='%23006600'/><rect x='2' width='3' height='3' fill='%23FF0000'/><circle cx='2' cy='1.5' r='0.5' fill='%23FFCC00'/></svg>",
  tr: "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 30 20'><rect width='30' height='20' fill='%23E30A17'/><circle cx='11' cy='10' r='4.5' fill='%23fff'/><circle cx='12.5' cy='10' r='3.6' fill='%23E30A17'/><polygon points='17,7 17.6,9 19.7,9 18,10.2 18.7,12.2 17,11 15.3,12.2 16,10.2 14.3,9 16.4,9' fill='%23fff'/></svg>",
  ja: "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 3 2'><rect width='3' height='2' fill='%23fff'/><circle cx='1.5' cy='1' r='0.6' fill='%23bc002d'/></svg>",
  ko: "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 30 20'><rect width='30' height='20' fill='%23fff'/><circle cx='15' cy='10' r='4' fill='%23cd2e3a'/><path d='M11,10 a4,4 0 0,1 8,0 a2,2 0 0,1 -4,0 a2,2 0 0,0 -4,0 z' fill='%23003478'/></svg>",
  zh: "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 30 20'><rect width='30' height='20' fill='%23DE2910'/><polygon points='6,3 7,5.5 9.5,5.5 7.5,7 8,9.5 6,8 4,9.5 4.5,7 2.5,5.5 5,5.5' fill='%23FFDE00'/></svg>",
  ar: "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 6'><rect width='12' height='2' fill='%23ce1126'/><rect y='2' width='12' height='2' fill='%23fff'/><rect y='4' width='12' height='2' fill='%23000'/><polygon points='0,0 4,3 0,6' fill='%23007a3d'/></svg>",
  nl: "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 3 2'><rect width='3' height='0.67' fill='%23AE1C28'/><rect y='0.67' width='3' height='0.67' fill='%23fff'/><rect y='1.34' width='3' height='0.66' fill='%2321468B'/></svg>",
  ro: "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 3 2'><rect width='1' height='2' fill='%23002B7F'/><rect x='1' width='1' height='2' fill='%23FCD116'/><rect x='2' width='1' height='2' fill='%23CE1126'/></svg>",
  hu: "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 6 3'><rect width='6' height='1' fill='%23CE2939'/><rect y='1' width='6' height='1' fill='%23fff'/><rect y='2' width='6' height='1' fill='%23477050'/></svg>",
};

function getFlagDataURI(code) {
  const svg = FLAG_SVGS[code] || FLAG_SVGS.en;
  return "data:image/svg+xml;utf8," + svg;
}

function getLang(code) {
  return LANGS.find(l => l.code === code) || LANGS[1];
}

const _dropdowns = [];

function makeFlagEl(code) {
  const flag = document.createElement("span");
  flag.className = "flag";
  flag.style.backgroundImage = "url(\"" + getFlagDataURI(code) + "\")";
  return flag;
}

function makeIconUse(id) {
  const NS = "http://www.w3.org/2000/svg";
  const XLINK = "http://www.w3.org/1999/xlink";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("class", "ic-svg " + id);
  const use = document.createElementNS(NS, "use");
  use.setAttributeNS(XLINK, "href", "#i-" + id);
  use.setAttribute("href", "#i-" + id);
  svg.appendChild(use);
  return svg;
}

function buildLangDropdown(rootEl, opts) {
  const onChange = (opts && opts.onChange) || (() => {});
  let value = (opts && opts.value) || (state.settings && state.settings.lang) || "uk";

  rootEl.innerHTML = "";

  // Trigger
  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "dropdown__trigger";

  const triggerFlag = makeFlagEl(value);
  const triggerLbl = document.createElement("span");
  triggerLbl.className = "lbl";
  triggerLbl.textContent = getLang(value).label;
  const caret = makeIconUse("caret");
  caret.classList.add("caret");

  trigger.appendChild(triggerFlag);
  trigger.appendChild(triggerLbl);
  trigger.appendChild(caret);
  rootEl.appendChild(trigger);

  // Menu
  const menu = document.createElement("div");
  menu.className = "dropdown__menu";
  menu.setAttribute("role", "listbox");

  const optionEls = LANGS.map(l => {
    const opt = document.createElement("button");
    opt.type = "button";
    opt.className = "dropdown__option" + (l.code === value ? " on" : "");
    opt.dataset.value = l.code;

    opt.appendChild(makeFlagEl(l.code));

    const lbl = document.createElement("span");
    lbl.textContent = l.label;
    opt.appendChild(lbl);

    const check = makeIconUse("check");
    check.classList.add("check");
    opt.appendChild(check);

    opt.addEventListener("click", e => {
      e.stopPropagation();
      setValue(l.code);
      close();
    });
    menu.appendChild(opt);
    return opt;
  });
  rootEl.appendChild(menu);
  /* Keep the menu's nominal home so we can return it after closing.
     While open, we portal the menu onto <body> so it isn't trapped by
     an ancestor's `backdrop-filter` / `transform` containing block. */
  let menuHome = rootEl;

  function positionMenu() {
    /* Position the menu in viewport coordinates so it can escape any
       overflow:hidden ancestor (e.g. #app-root). We pick top or bottom
       based on which side has more room, and clamp the height so the
       full menu is always visible. The menu's left edge is also clamped
       to keep wide labels inside the viewport. */
    const r = trigger.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const margin = 8;
    const gap = 6;
    // measure intrinsic size by briefly making it visible & natural-height
    menu.style.maxHeight = "";
    menu.style.left = "0px"; menu.style.top = "0px";
    menu.style.right = "auto"; menu.style.bottom = "auto";
    const mw = Math.max(menu.offsetWidth, r.width);
    const fullH = menu.scrollHeight;
    const spaceBelow = vh - r.bottom - margin - gap;
    const spaceAbove = r.top - margin - gap;
    const openUp = spaceBelow < Math.min(fullH, 200) && spaceAbove > spaceBelow;
    const maxH = Math.min(360, Math.max(140, openUp ? spaceAbove : spaceBelow));
    menu.style.maxHeight = maxH + "px";
    // Horizontal: align right edge with trigger right, clamped to viewport.
    let left = r.right - mw;
    if (left < margin) left = margin;
    if (left + mw > vw - margin) left = vw - margin - mw;
    menu.style.left = left + "px";
    if (openUp) {
      menu.style.top = "auto";
      menu.style.bottom = (vh - r.top + gap) + "px";
      rootEl.classList.add("open-up");
      menu.classList.add("is-open-up");
    } else {
      menu.style.bottom = "auto";
      menu.style.top = (r.bottom + gap) + "px";
      rootEl.classList.remove("open-up");
      menu.classList.remove("is-open-up");
    }
  }
  function open() {
    closeAll();
    /* Portal the menu onto <body> so the `position: fixed` coordinates
       are always interpreted relative to the viewport, not an ancestor
       with backdrop-filter / transform. */
    if (menu.parentNode !== document.body) {
      document.body.appendChild(menu);
    }
    menu.classList.add("is-open");
    rootEl.classList.add("open");
    positionMenu();
  }
  function close() {
    rootEl.classList.remove("open", "open-up");
    menu.classList.remove("is-open", "is-open-up");
    /* Move the menu back to its nominal home (idempotent). */
    if (menu.parentNode !== menuHome) menuHome.appendChild(menu);
  }
  function applyValueToDom(code) {
    triggerFlag.style.backgroundImage = "url(\"" + getFlagDataURI(code) + "\")";
    triggerLbl.textContent = getLang(code).label;
    optionEls.forEach(opt => {
      opt.classList.toggle("on", opt.dataset.value === code);
    });
  }
  function setValue(code) {
    if (code === value) return;
    value = code;
    applyValueToDom(code);
    onChange(code);
  }
  function setValueSilent(code) {
    if (!LANGS.some(l => l.code === code)) return;
    value = code;
    applyValueToDom(code);
  }

  trigger.addEventListener("click", e => {
    e.stopPropagation();
    if (rootEl.classList.contains("open")) close();
    else open();
  });

  // Re-position the open menu on viewport changes so it stays in bounds.
  // Skip the reflow when the scroll happens *inside* the menu itself —
  // otherwise the position is recomputed on every wheel/touch frame and
  // scrolling the language list jitters or stops outright on mobile.
  const reflow = (ev) => {
    if (!rootEl.classList.contains("open")) return;
    if (ev && ev.target && menu.contains(ev.target)) return;
    positionMenu();
  };
  window.addEventListener("resize", reflow, { passive: true });
  window.addEventListener("scroll", reflow, { passive: true, capture: true });

  const api = { setValue: setValueSilent, close, root: rootEl };
  _dropdowns.push(api);
  return api;
}

function closeAll() {
  _dropdowns.forEach(d => d.close());
}

document.addEventListener("click", () => closeAll());
document.addEventListener("keydown", e => {
  if (e.key === "Escape") closeAll();
});
