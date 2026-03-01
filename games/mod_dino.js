// Live mod overlay for dino (T-Rex runner). RL applies hints to game speed, gravity, jump, max speed.
(function () {
  'use strict';
  function applyRLHint(hint) {
    if (!hint || (typeof Runner === 'undefined') || !Runner.instance_) return;
    var r = Runner.instance_;
    try {
      if (hint.hook && hint.hook > 0) {
        var speed = r.currentSpeed;
        r.setSpeed(Math.min(20, Math.max(1, speed + hint.hook * 4)));
        console.log('[Mod Dino] RL apply: increase_hook -> speed', speed.toFixed(1), '->', r.currentSpeed.toFixed(1));
      }
      if (hint.friction && hint.friction < 0) {
        var g = Runner.config.GRAVITY;
        Runner.config.GRAVITY = Math.max(0.1, Math.min(2, g * (1 + hint.friction)));
        console.log('[Mod Dino] RL apply: decrease_friction -> gravity', g.toFixed(2), '->', Runner.config.GRAVITY.toFixed(2));
      }
      if (hint.variability && hint.variability > 0) {
        var j = Runner.config.INITIAL_JUMP_VELOCITY;
        Runner.config.INITIAL_JUMP_VELOCITY = Math.max(5, Math.min(25, j + (Math.random() - 0.5) * 2));
        console.log('[Mod Dino] RL apply: inject_variability -> jump', j.toFixed(1), '->', Runner.config.INITIAL_JUMP_VELOCITY.toFixed(1));
      }
    } catch (e) { console.warn('[Mod Dino] RL apply error', e); }
  }
  function init() {
    if (typeof ModOverlay === 'undefined' || typeof Runner === 'undefined' || !Runner.instance_) {
      setTimeout(init, 500);
      return;
    }
    var r = Runner.instance_;
    ModOverlay.create([
      {
        label: 'Game speed',
        get: function () { try { return r.currentSpeed; } catch (e) { return 6; } },
        set: function (v) { try { r.setSpeed(Math.max(1, Math.min(20, v))); } catch (e) {} },
        min: 1, max: 20, step: 0.5,
        default: 6
      },
      {
        label: 'Gravity',
        get: function () { try { return Runner.config.GRAVITY; } catch (e) { return 0.6; } },
        set: function (v) { try { Runner.config.GRAVITY = Math.max(0.1, Math.min(2, v)); } catch (e) {} },
        min: 0.1, max: 2, step: 0.05,
        default: 0.6
      },
      {
        label: 'Jump velocity',
        get: function () { try { return Runner.config.INITIAL_JUMP_VELOCITY; } catch (e) { return 12; } },
        set: function (v) { try { Runner.config.INITIAL_JUMP_VELOCITY = Math.max(5, Math.min(25, v)); } catch (e) {} },
        min: 5, max: 25, step: 0.5,
        default: 12
      },
      {
        label: 'Max speed',
        get: function () { try { return Runner.config.MAX_SPEED; } catch (e) { return 12; } },
        set: function (v) { try { Runner.config.MAX_SPEED = Math.max(6, Math.min(30, v)); } catch (e) {} },
        min: 6, max: 30, step: 1,
        default: 12
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
    console.log('[Mod] Live overlay ready for dino (RL applies to speed, gravity, jump)');
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(init, 500); });
  } else {
    setTimeout(init, 500);
  }
})();
