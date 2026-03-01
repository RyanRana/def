// Live mod overlay for snake. RL applies hints to frame skip and initial length.
(function () {
  'use strict';
  function applyRLHint(hint) {
    if (!hint) return;
    try {
      if (hint.hook && hint.hook > 0) {
        var skip = window.__snakeFrameSkip != null ? window.__snakeFrameSkip : 4;
        window.__snakeFrameSkip = Math.max(1, Math.min(15, Math.round(skip - hint.hook * 4)));
        console.log('[Mod Snake] RL apply: increase_hook -> frameSkip', skip, '->', window.__snakeFrameSkip);
      }
      if (hint.friction && hint.friction < 0) {
        var skip = window.__snakeFrameSkip != null ? window.__snakeFrameSkip : 4;
        window.__snakeFrameSkip = Math.max(1, Math.min(15, Math.round(skip + Math.abs(hint.friction) * 4)));
        console.log('[Mod Snake] RL apply: decrease_friction -> frameSkip', skip, '->', window.__snakeFrameSkip);
      }
      if (hint.variability && hint.variability > 0 && typeof snake !== 'undefined') {
        var len = snake.maxCells;
        snake.maxCells = Math.max(1, Math.min(20, Math.round(len + (Math.random() - 0.5) * 2)));
        console.log('[Mod Snake] RL apply: inject_variability -> initial length', len, '->', snake.maxCells);
      }
    } catch (e) { console.warn('[Mod Snake] RL apply error', e); }
  }
  function init() {
    if (typeof ModOverlay === 'undefined') {
      setTimeout(init, 200);
      return;
    }
    ModOverlay.create([
      {
        label: 'Game speed (frame skip)',
        get: function () { return window.__snakeFrameSkip != null ? window.__snakeFrameSkip : 4; },
        set: function (v) { window.__snakeFrameSkip = Math.max(1, Math.min(15, Math.round(v))); },
        min: 1, max: 15, step: 1,
        default: 4
      },
      {
        label: 'Initial length',
        get: function () { try { return snake.maxCells; } catch (e) { return 4; } },
        set: function (v) { try { snake.maxCells = Math.max(1, Math.min(20, Math.round(v))); } catch (e) {} },
        min: 1, max: 20, step: 1,
        default: 4
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
    console.log('[Mod] Live overlay ready for snake (RL applies to speed, length)');
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 100);
  }
})();
