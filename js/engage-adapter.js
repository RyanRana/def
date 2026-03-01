/**
 * Engage adapter: sets __engageGetScore, __engageGetDeaths, __engageScriptsBase
 * by reading from the running game's globals or DOM. No game source code is modified.
 * Load this in the game page context (after game has run) before camera-consent.
 */
(function (global) {
  'use strict';
  var pathname = (global.location && global.location.pathname) || '';
  var base = pathname.indexOf('games') !== -1 ? '../js/' : 'js/';
  global.__engageScriptsBase = base;

  if (pathname.indexOf('snake') !== -1) {
    global.__engageGetScore = function () {
      try { return (typeof snake !== 'undefined' && snake.maxCells) ? snake.maxCells - 4 : 0; } catch (e) { return 0; }
    };
    global.__engageGetDeaths = function () {
      try { return (global.gameDeaths != null) ? global.gameDeaths : 0; } catch (e) { return 0; }
    };
    return;
  }
  if (pathname.indexOf('dino') !== -1) {
    global.__engageGetScore = function () {
      try { return (global.Runner && Runner.instance_) ? Math.ceil(Runner.instance_.distanceRan) : 0; } catch (e) { return 0; }
    };
    global.__engageGetDeaths = function () {
      try { return (global._dinoGameDeaths != null) ? global._dinoGameDeaths : 0; } catch (e) { return 0; }
    };
    return;
  }
  if (pathname.indexOf('bird') !== -1) {
    global.__birdDeathCount = 0;
    global.__birdLostVisible = false;
    // Poll for death screen visibility to count deaths accurately
    setInterval(function () {
      try {
        var el = global.document && global.document.getElementById('DeathScreen');
        var visible = el && el.style.display !== 'none' && el.offsetParent !== null;
        if (visible && !global.__birdLostVisible) {
          global.__birdDeathCount++;
        }
        global.__birdLostVisible = !!visible;
      } catch (e) {}
    }, 200);
    global.__engageGetScore = function () {
      try {
        // Try new DOM first, fallback to window.CurrentScore
        var el = global.document && (global.document.getElementById('ScoreDisplay') || global.document.getElementById('CurrentScore'));
        if (el) return parseInt(el.textContent, 10) || 0;
        return global.CurrentScore || 0;
      } catch (e) { return 0; }
    };
    global.__engageGetDeaths = function () {
      return global.__birdDeathCount || 0;
    };
    return;
  }
  global.__engageGetScore = function () { return 0; };
  global.__engageGetDeaths = function () { return 0; };
})(typeof window !== 'undefined' ? window : globalThis);
