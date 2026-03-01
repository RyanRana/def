// Game mod injectors for snake — hand-tuned with runtime hooks
(function () {
  'use strict';

  // === RUNTIME HOOKS ===
  // Death forgiveness: after death resets maxCells to 4, bump it to forgiveness value
  var _lastCellCount = 0;
  setInterval(function () {
    try {
      var cells = snake.cells ? snake.cells.length : 0;
      if (_lastCellCount > 2 && cells === 0) {
        var forgive = window.__snakeDeathForgive;
        if (forgive && forgive > 4) {
          setTimeout(function () {
            try { snake.maxCells = forgive; } catch (e) {}
          }, 50);
        }
      }
      _lastCellCount = cells;
    } catch (e) {}
  }, 100);

  // Apple attract: when apple respawns, move it near the snake head
  var _lastAppleX = -1, _lastAppleY = -1;
  setInterval(function () {
    try {
      var radius = window.__snakeAppleRadius;
      if (!radius || radius <= 0) { _lastAppleX = apple.x; _lastAppleY = apple.y; return; }
      if (apple.x !== _lastAppleX || apple.y !== _lastAppleY) {
        var g = typeof grid !== 'undefined' ? grid : 16;
        var maxG = Math.floor(400 / g);
        var hx = Math.floor(snake.x / g);
        var hy = Math.floor(snake.y / g);
        var r = Math.max(1, radius);
        var nx = hx + Math.floor(Math.random() * (2 * r + 1)) - r;
        var ny = hy + Math.floor(Math.random() * (2 * r + 1)) - r;
        nx = Math.max(0, Math.min(maxG - 1, nx));
        ny = Math.max(0, Math.min(maxG - 1, ny));
        apple.x = nx * g;
        apple.y = ny * g;
      }
      _lastAppleX = apple.x;
      _lastAppleY = apple.y;
    } catch (e) {}
  }, 100);

  // Track deaths for the adapter
  var _prevMaxCells = 4;
  setInterval(function () {
    try {
      if (snake.cells && snake.cells.length === 0 && _prevMaxCells > 1) {
        window.gameDeaths = (window.gameDeaths || 0) + 1;
      }
      _prevMaxCells = snake.maxCells || 4;
    } catch (e) {}
  }, 100);

  var mods = [
    {
      key: "game_frame_skip",
      label: "Game Speed",
      category: "speed",
      "default": 3,
      min: 1,
      max: 8,
      step: 1,
      get: function() { try { return window.__snakeFrameSkip != null ? window.__snakeFrameSkip : 3; } catch(e) { return 3; } },
      set: function(VALUE) { try { window.__snakeFrameSkip = VALUE; } catch(e) {} },
      invert: true
    },
    {
      key: "death_forgiveness",
      label: "Death Forgiveness",
      category: "forgiveness",
      "default": 4,
      min: 4,
      max: 12,
      step: 1,
      get: function() { try { return window.__snakeDeathForgive != null ? window.__snakeDeathForgive : 4; } catch(e) { return 4; } },
      set: function(VALUE) { try { window.__snakeDeathForgive = VALUE; } catch(e) {} }
    },
    {
      key: "apple_attract_radius",
      label: "Apple Proximity",
      category: "reward",
      "default": 0,
      min: 0,
      max: 10,
      step: 1,
      get: function() { try { return window.__snakeAppleRadius != null ? window.__snakeAppleRadius : 0; } catch(e) { return 0; } },
      set: function(VALUE) { try { window.__snakeAppleRadius = VALUE; } catch(e) {} }
    },
    {
      key: "grid_cell_size",
      label: "Grid Cell Size",
      category: "difficulty",
      "default": 16,
      min: 8,
      max: 40,
      step: 4,
      get: function() { try { return grid; } catch(e) { return 16; } },
      set: function(VALUE) { try { snake.dx = (snake.dx / grid) * VALUE; snake.dy = (snake.dy / grid) * VALUE; grid = VALUE; } catch(e) {} }
    },
    {
      key: "bonus_apple_count",
      label: "Bonus Apples",
      category: "bonus_reward",
      "default": 0,
      min: 0,
      max: 5,
      step: 1,
      get: function() { try { return window.__snakeBonusCount || 0; } catch(e) { return 0; } },
      set: function(VALUE) { try { window.__snakeBonusCount = VALUE; } catch(e) {} }
    },
    {
      key: "wall_obstacle_count",
      label: "Wall Obstacles",
      category: "obstacle",
      "default": 0,
      min: 0,
      max: 4,
      step: 1,
      get: function() { try { return window.__snakeWallCount || 0; } catch(e) { return 0; } },
      set: function(VALUE) { try { window.__snakeWallCount = VALUE; } catch(e) {} }
    },
    {
      key: "speed_burst",
      label: "Speed Burst",
      category: "visual",
      "default": 0,
      min: 0,
      max: 3,
      step: 1,
      get: function() { try { return window.__snakeSpeedBurst || 0; } catch(e) { return 0; } },
      set: function(VALUE) { try { window.__snakeSpeedBurst = VALUE; window.__snakeSpeedBurstTimer = 300; } catch(e) {} }
    }
  ];
  window.__gameMods = mods;
  window.__gameModsByKey = {};
  for (var i = 0; i < mods.length; i++) window.__gameModsByKey[mods[i].key] = mods[i];
  // Speed-first; no bonus_apple in engagement so agent focuses on speed / forgiveness / difficulty
  window.__engageModKeys = ["game_frame_skip","death_forgiveness","apple_attract_radius","wall_obstacle_count","speed_burst"];
  console.log('[GameMods] Registered ' + mods.length + ' mods for snake (' + window.__engageModKeys.length + ' engagement levers)');
})();
