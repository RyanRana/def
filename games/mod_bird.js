// Live mod overlay for bird (Flappy Bird). RL applies hints to BirdyConfig.
// Uses window.BirdyConfig: gravAccel, terminalVelocity, jumpHeight, pipeInterval
(function () {
  'use strict';
  function applyRLHint(hint) {
    if (!hint || !window.BirdyConfig) return;
    var c = window.BirdyConfig;
    try {
      if (hint.hook && hint.hook > 0) {
        var j = c.jumpHeight != null ? c.jumpHeight : 9;
        c.jumpHeight = Math.max(3, Math.min(20, j + hint.hook * 4));
        console.log('[Mod Bird] RL apply: increase_hook -> jumpHeight', j, '->', c.jumpHeight);
      }
      if (hint.friction && hint.friction < 0) {
        var g = c.gravAccel != null ? c.gravAccel : 0.3;
        c.gravAccel = Math.max(0.1, Math.min(1.5, g * (1 + hint.friction)));
        console.log('[Mod Bird] RL apply: decrease_friction -> gravAccel', g.toFixed(2), '->', c.gravAccel.toFixed(2));
      }
      if (hint.variability && hint.variability > 0) {
        var p = c.pipeInterval != null ? c.pipeInterval : 90;
        c.pipeInterval = Math.max(30, Math.min(180, Math.round(p + (Math.random() - 0.5) * 20)));
        console.log('[Mod Bird] RL apply: inject_variability -> pipeInterval', p, '->', c.pipeInterval);
      }
    } catch (e) { console.warn('[Mod Bird] RL apply error', e); }
  }
  function init() {
    if (typeof ModOverlay === 'undefined') {
      setTimeout(init, 200);
      return;
    }
    if (!window.BirdyConfig) {
      window.BirdyConfig = { gravAccel: 0.3, terminalVelocity: 5, jumpHeight: 9, pipeInterval: 90 };
    }
    var c = window.BirdyConfig;
    ModOverlay.create([
      {
        label: 'Gravity acceleration',
        get: function () { return c.gravAccel != null ? c.gravAccel : 0.3; },
        set: function (v) { c.gravAccel = Math.max(0.1, Math.min(1.5, v)); },
        min: 0.1, max: 1.5, step: 0.05,
        default: 0.3
      },
      {
        label: 'Terminal velocity',
        get: function () { return c.terminalVelocity != null ? c.terminalVelocity : 5; },
        set: function (v) { c.terminalVelocity = Math.max(2, Math.min(15, v)); },
        min: 2, max: 15, step: 0.5,
        default: 5
      },
      {
        label: 'Jump height (%)',
        get: function () { return c.jumpHeight != null ? c.jumpHeight : 9; },
        set: function (v) { c.jumpHeight = Math.max(3, Math.min(20, v)); },
        min: 3, max: 20, step: 1,
        default: 9
      },
      {
        label: 'Pipe interval (loops)',
        get: function () { return c.pipeInterval != null ? c.pipeInterval : 90; },
        set: function (v) { c.pipeInterval = Math.max(30, Math.min(180, Math.round(v))); },
        min: 30, max: 180, step: 5,
        default: 90
      }
    ]);
    if (window.addEventListener) {
      window.addEventListener('engageRLDecision', function (e) {
        if (e.detail && e.detail.action != null && e.detail.action !== 0) {
          var h = window.__engageRLModHint;
          if (h) applyRLHint(h);
        }
      });
    }
    console.log('[Mod] Live overlay ready for bird (RL applies to gravity, jump, pipe interval)');
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 100);
  }
})();
