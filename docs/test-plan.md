# HEXON BETA — Adversarial Test Plan (PR #1)

PR: https://github.com/andriy0323/HEXON/pull/1
Branch: `devin/1778868054-hexon-improvements`
URL under test: `http://localhost:8765/index.html`
Browser: Chrome (Linux), window sized to a phone-narrow viewport (≈ 440×900) using DevTools device mode emulation, **mouse**-driven (laptop) — touch-specific behaviors are exercised by re-sizing the viewport so the same overflow / scroll-clip code paths fire.

The three scenarios below are the user-reported bugs ("when I place a piece the tray bug stays on screen" + "I can't scroll down when changing language") plus the new Exit modal flow promised by the PR. Anything else (full sound, level-up, etc.) is left to the user's own play-through per the PR's "Review & Testing Checklist".

---

## Test 1 — Language dropdown opens and scrolls inside the menu

**Why this is adversarial.** Before the fix:
- `dropdown.js` re-positioned the menu on **every** scroll event (`capture: true`), including scrolls happening **inside** the menu itself → `positionMenu()` reset `maxHeight = ""` and snapped the position on every wheel/touch tick, killing momentum scroll on mobile.
- `.dropdown__menu` had no `touch-action: pan-y` or `-webkit-overflow-scrolling: touch`, so a portaled-to-`<body>` menu with `position: fixed; overflow-y: auto` would not finger-scroll inside Chrome's mobile emulation.

If the change is broken, scrolling the menu either (a) does nothing, (b) bounces back to the top, or (c) scrolls the page underneath.

### Steps
1. Open `http://localhost:8765/index.html` in Chrome, resize the window to ≈ 440×900 so the menu can't show all 18 languages without scrolling.
2. On the login screen, click the language dropdown trigger in the footer (`.login-footer .dropdown__trigger`).
3. Observe the menu opens, every visible row shows a flag + label, and the topmost row is the currently-selected language (currently "Українська").
4. Use the mouse wheel **inside the menu area** to scroll down. Confirm:
   - The list scrolls smoothly through to the bottom (last item should be **Magyar**).
   - The menu's overall position **does not jump**; only its internal scroll position changes.
   - The page underneath does **not** scroll along with the menu (overscroll-behavior: contain).
5. Click the **Magyar** row.
6. Confirm the dropdown closes and the trigger label updates to "Magyar".

### Pass / Fail
- **PASS** if step 4 reaches "Magyar" via scroll **inside** the menu, the menu's outer position is unchanged during scroll, and clicking "Magyar" in step 5 dismisses the menu and updates the trigger label.
- **FAIL** if the menu jitters, snaps back, refuses to scroll, or if "Magyar" cannot be reached via scroll. Also FAIL if clicking the row doesn't change the trigger label.

---

## Test 2 — Tray slot does not overflow for a long 1×5 vertical bar piece

**Why this is adversarial.** The user's screenshot shows green cells visibly sticking out above a tray slot. The fix makes `pieceSwatch()` scale `--piece-cell-px` down for shapes whose longest side is ≥ 4 (18 → 15 → 13 → 11 px), and caps `.piece` at `max-height: 130px`. If either fix regresses, a 1×5 vertical bar (`SHAPES[7]`) will visually escape the slot's border.

We deterministically inject a 1×5 vertical bar into tray slot 0 via DevTools — `genPieces()` is random, so we can't rely on natural draw within a recording-friendly time budget.

### Steps
1. From the menu, click **Грати** ("Play").
2. Open Chrome DevTools console.
3. Run:
   ```js
   state.run.pieces[0] = {
     shape: [[1],[1],[1],[1],[1]],     // 1×5 vertical bar
     color: "#3ddc97",                  // green
     id: "test-1x5",
     used: false,
   };
   renderTray();
   ```
4. Take a screenshot of the tray.
5. Visually inspect: the entire green 5-cell bar must sit **inside** the leftmost tray slot's rounded-rect background. No green cell may appear above the slot's top edge or below its bottom edge.
6. Measure with DevTools "Inspect Element" on the first `.piece` and the first `.piece-cell`:
   - `.piece` `getBoundingClientRect().height` should be **≤ 132 px** (`max-height: 130px` + 2px border).
   - `.piece-cell` `clientWidth` / `clientHeight` should both be **≤ 14 px** (the JS picks `13` for `longest === 5`, browser rounding may push up to 14).

### Pass / Fail
- **PASS** if every cell of the 1×5 bar is visually inside the slot, the slot height is ≤ 132 px, and the cell size is ≤ 14 px.
- **FAIL** if any cell escapes the slot's rounded border, or if the slot grows taller than 132 px, or if the cell size remains at the old 18 px (= regression of the JS sizing change).

---

## Test 3 — Exit modal happy path

**Why this is adversarial.** The new Exit feature must (a) open from the menu tile, (b) show the four buttons in the user's selected language (Ukrainian), and (c) close cleanly when "Keep playing" is clicked. If `openModal`/`closeModal` are wired wrong, or the `.modal-back.show` / `.modal-back.active` classes don't get toggled together, the modal will either not appear at all or stay stuck on the screen after the click.

### Steps
1. From the menu, click the **Вийти** tile (`#menu-exit`, the red-tinted tile in the bottom-left).
2. Observe `#modal-exit` becomes visible — backdrop dims, the modal card animates in, the farewell SVG illustration is visible at the top.
3. Confirm the four buttons render with the Ukrainian labels:
   - `#exit-stay` — "Продовжити гру"  (primary, full-width)
   - `#exit-pause` — "Зробити паузу"
   - `#exit-signout` — "Вийти з акаунту"
   - `#exit-quit` — "Закрити гру" (red `btn-danger`)
4. Click **Продовжити гру** (`#exit-stay`).
5. Observe `#modal-exit` is removed from the visible DOM tree (backdrop disappears, menu is interactive again).
6. Re-open the modal once more (step 1) and press the **Escape** key.
7. Observe the modal closes via the global Escape handler in `scripts/main.js`.

### Pass / Fail
- **PASS** if the modal opens with the SVG + 4 buttons in Ukrainian, "Продовжити гру" dismisses it, and Escape also dismisses it.
- **FAIL** if the modal does not open, the labels are still in English (fallback fired unexpectedly when locale is `uk`), the SVG is missing, "Продовжити гру" leaves the modal visible, or Escape does nothing.

---

## What I will NOT test in this recording (per PR scope)

These are listed in the PR's "Review & Testing Checklist" as items for the human to verify themselves and are not in-scope for this short adversarial recording:

- **Sign out / Quit** branches of the exit modal — they reload or close the tab, which terminates the recording. Verified by code inspection (`scripts/ui.js:315-330`) only.
- **Sound effects feel** — subjective, sound effects are also not captured in a silent recording.
- **Level-up celebration** — requires playing far enough to gain enough XP, out of scope for a short test.
- **APK on Android device** — needs an emulator/device, separate deliverable.
