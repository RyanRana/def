/**
 * Engage bootstrap: loads tracking layer on top of the game without editing game code.
 * Injected by server into game pages.
 * Load order: game_state_*.js → game_mods_*.js → adapter → camera-consent (→ tracker → vitals → UI → RL).
 * VitalLens (vitallens.js) is loaded in parallel for HR/BR when available; inference-vitals uses it or falls back to local rPPG.
 */
(function (global) {
  'use strict';
  var pathname = (global.location && global.location.pathname) || '';
  var base = pathname.indexOf('games') !== -1 ? '../js/' : 'js/';
  var gameMatch = pathname.match(/\/(snake|bird|dino)\.html/);

  (function loadVitalLens() {
    var s = global.document.createElement('script');
    s.type = 'module';
    s.textContent = "import('https://cdn.jsdelivr.net/npm/vitallens@0.3.2/dist/vitallens.browser.js').then(function(m){ window.VitalLens = m.VitalLens || m.default; window.__vitallensReady = true; }).catch(function(){ window.__vitallensReady = false; });";
    global.document.body.appendChild(s);
  })();

  function loadScript(src, cb) {
    var s = global.document.createElement('script');
    s.src = src;
    s.onload = cb;
    s.onerror = cb;
    global.document.body.appendChild(s);
  }

  function loadConsent() {
    loadScript(base + 'engage-adapter.js', function () {
      loadScript(base + 'camera-consent.js', function () {});
    });
  }

  function loadGameMods(gameName) {
    loadScript('game_mods_' + gameName + '.js', loadConsent);
  }

  if (gameMatch) {
    var gameName = gameMatch[1];
    loadScript('game_state_' + gameName + '.js', function () {
      loadGameMods(gameName);
    });
  } else {
    loadConsent();
  }
})(typeof window !== 'undefined' ? window : globalThis);
