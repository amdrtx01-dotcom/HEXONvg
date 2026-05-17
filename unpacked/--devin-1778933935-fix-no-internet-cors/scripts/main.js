/* ============================================================
   HEXON BETA — boot
   ============================================================ */
"use strict";

document.addEventListener("DOMContentLoaded", () => {
  try { init(); }
  finally { dismissBootSplash(); }
});

/* Dismiss the inline #boot-splash that is painted from index.html
   before any JS runs. We keep the node in the DOM during the CSS
   transition so the fade-out is smooth, then remove it once the
   transition finishes. A safety timer also forces a removal in
   case the transition event never fires (e.g. tab was hidden).

   The boot is anchored to the moment the splash node was mounted
   in <head>'s inline script (HEXON_BOOT_TS), not to DOMContentLoaded,
   so the 3s window we promise the player is actually 3s of splash
   on screen — even when init() is fast and we'd otherwise dismiss
   it almost immediately. */
function dismissBootSplash(){
  const el = document.getElementById("boot-splash");
  if(!el) return;
  const MIN_SHOWN_MS = 3000;
  const startedAt = (typeof window.HEXON_BOOT_TS === "number") ? window.HEXON_BOOT_TS : Date.now();
  const elapsed   = Math.max(0, Date.now() - startedAt);
  const wait      = Math.max(0, MIN_SHOWN_MS - elapsed);
  setTimeout(() => {
    el.classList.add("dismissed");
    const cleanup = () => { if(el.parentNode) el.parentNode.removeChild(el); };
    el.addEventListener("transitionend", cleanup, { once: true });
    setTimeout(cleanup, 1500);
  }, wait);
}

/* Modal show/hide helpers. We use both .show (legacy) and .active
   (animation hook in effects.css) so old CSS keeps working while
   the new entrance animations also fire. */
function openModal(sel){
  const m = (typeof sel === "string") ? document.querySelector(sel) : sel;
  if(!m) return;
  m.classList.add("show", "active");
  if(typeof sfx !== "undefined") sfx.modalOpen();
}
function closeModal(sel){
  const m = (typeof sel === "string") ? document.querySelector(sel) : sel;
  if(!m) return;
  m.classList.remove("show", "active");
  if(typeof sfx !== "undefined") sfx.modalClose();
}

/* Close any open modal with Escape — accessibility win. */
document.addEventListener("keydown", (e) => {
  if(e.key === "Escape"){
    document.querySelectorAll(".modal-back.show, .modal-back.active").forEach(m => {
      m.classList.remove("show", "active");
    });
  }
});

/* Unlock the audio context on the very first user gesture so future
   sound calls actually play. Chrome and Safari refuse to start
   audio until then; we listen once and self-detach. */
function _firstAudioUnlock(){
  if(typeof resumeAudio === "function") resumeAudio();
  window.removeEventListener("pointerdown", _firstAudioUnlock, true);
  window.removeEventListener("keydown",     _firstAudioUnlock, true);
  window.removeEventListener("touchstart",  _firstAudioUnlock, true);
}
window.addEventListener("pointerdown", _firstAudioUnlock, true);
window.addEventListener("keydown",     _firstAudioUnlock, true);
window.addEventListener("touchstart",  _firstAudioUnlock, true);
