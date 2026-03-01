/**
 * Camera consent: full-screen overlay before the game. User chooses
 * "Allow camera" or "Skip". After consent, loads (in order):
 * engage-tracker → inference-vitals → engage-logger → engage-tracker-ui → engage-stimulus → engage-rl.
 * Load this after __engageGetScore / __engageGetDeaths are set (adapter).
 */
(function (global) {
  'use strict';

  var overlay = null;
  var statusEl = null;

  function createOverlay() {
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'camera-consent-overlay';
    overlay.setAttribute('aria-live', 'polite');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-labelledby', 'camera-consent-title');
    // Non-blocking banner at top — game is playable behind it
    overlay.style.cssText = [
      'position:fixed;top:0;left:0;right:0;z-index:99999;',
      'display:flex;align-items:center;justify-content:center;',
      'background:rgba(0,0,0,0.85);',
      'padding:12px 20px;box-sizing:border-box;',
      'pointer-events:auto;'
    ].join('');

    var card = document.createElement('div');
    card.style.cssText = [
      'color:#fff;font-family:system-ui,-apple-system,sans-serif;',
      'display:flex;align-items:center;gap:16px;flex-wrap:wrap;justify-content:center;',
      'max-width:800px;width:100%;'
    ].join('');

    var text = document.createElement('span');
    text.id = 'camera-consent-title';
    text.textContent = 'Enable camera for vitals tracking? Camera Requested (optional, all local)';
    text.style.cssText = 'font-size:0.95rem;opacity:0.9;';
    card.appendChild(text);

    statusEl = document.createElement('span');
    statusEl.id = 'camera-consent-status';
    statusEl.style.cssText = 'font-size:0.85rem;color:#fbb;';
    card.appendChild(statusEl);

    var buttons = document.createElement('div');
    buttons.style.cssText = 'display:flex;gap:8px;';

    var allowBtn = document.createElement('button');
    allowBtn.textContent = 'Allow camera';
    allowBtn.style.cssText = [
      'padding:6px 16px;font-size:0.85rem;font-weight:600;',
      'background:#22c55e;color:#fff;border:none;border-radius:6px;cursor:pointer;'
    ].join('');
    allowBtn.onclick = function () { requestCamera(true); };

    var skipBtn = document.createElement('button');
    skipBtn.textContent = 'Skip';
    skipBtn.style.cssText = [
      'padding:6px 16px;font-size:0.85rem;font-weight:500;',
      'background:transparent;color:#94a3b8;border:1px solid #475569;border-radius:6px;cursor:pointer;'
    ].join('');
    skipBtn.onclick = function () { requestCamera(false); };

    buttons.appendChild(allowBtn);
    buttons.appendChild(skipBtn);
    card.appendChild(buttons);

    overlay.appendChild(card);
    document.body.appendChild(overlay);

    // Auto-dismiss after 8 seconds if no interaction — start without camera
    var autoDismiss = setTimeout(function () {
      if (overlay && overlay.parentNode) requestCamera(false);
    }, 8000);
    overlay._autoDismiss = autoDismiss;

    return overlay;
  }

  function setStatus(msg) {
    if (statusEl) statusEl.textContent = msg || '';
  }

  function done() {
    global.__cameraConsentDone = true;
    if (overlay && overlay._autoDismiss) clearTimeout(overlay._autoDismiss);
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    overlay = null;
    statusEl = null;
    try {
      global.dispatchEvent(new Event('cameraConsentDone'));
    } catch (e) {
      if (global.document) document.dispatchEvent(new Event('cameraConsentDone'));
    }
    loadTracker();
  }

  function loadTracker() {
    var getScore = global.__engageGetScore || function () { return 0; };
    var getDeaths = global.__engageGetDeaths || function () { return 0; };
    var pathname = (document.location && document.location.pathname) || '';
    var base = (global.__engageScriptsBase !== undefined) ? global.__engageScriptsBase : (pathname.indexOf('games') !== -1 ? '../js/' : 'js/');
    var gameMatch = pathname.match(/\/(snake|bird|dino)\.html/);
    var gameStateSrc = gameMatch && pathname.indexOf('games') !== -1 ? 'game_state_' + gameMatch[1] + '.js' : null;

    function loadScript(src, cb) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = cb;
      document.body.appendChild(s);
    }
    function loadEngageChain() {
      loadScript(base + 'engage-tracker.js', function () {
        loadScript(base + 'inference-vitals.js', function () {
          loadScript(base + 'engage-logger.js', function () {
            loadScript(base + 'engage-tracker-ui.js', function () {
              if (global.startEngageTrackerUI) {
                startEngageTrackerUI({ getScore: getScore, getDeaths: getDeaths });
              }
              loadScript(base + 'engage-stimulus.js', function () {
                loadScript(base + 'engage-rl.js', function () {});
              });
            });
          });
        });
      });
    }
    if (gameStateSrc && !global.getEngageGameState) {
      loadScript(gameStateSrc, loadEngageChain);
    } else {
      loadEngageChain();
    }
  }

  function requestCamera(allow) {
    if (!allow) {
      done();
      return;
    }
    setStatus('Requesting camera…');
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setStatus('Camera not supported. Continuing without.');
      setTimeout(done, 1500);
      return;
    }
    navigator.mediaDevices.getUserMedia({ video: true })
      .then(function (stream) {
        stream.getTracks().forEach(function (t) { t.stop(); });
        setStatus('');
        done();
      })
      .catch(function (err) {
        setStatus('Camera denied or unavailable. Click Skip to play.');
      });
  }

  function init() {
    createOverlay();
  }

  init();
})(typeof window !== 'undefined' ? window : globalThis);
