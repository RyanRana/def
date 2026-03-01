// Game mod injectors for snake — auto-generated from game_profiles/snake.json
// window.__gameMods = array of { key, label, category, default, min, max, step, get(), set(v) }
(function () {
  'use strict';
  var mods = [
    {
      key: "game_frame_skip",
      label: "Game Frame Skip",
      category: "speed",
      "default": 3,
      min: 1,
      max: 10,
      step: 1,
      get: function() { try { return window.__snakeFrameSkip != null ? window.__snakeFrameSkip : 3; } catch(e) { return 3; } },
      set: function(VALUE) { try { window.__snakeFrameSkip = VALUE; } catch(e) {} }
    },
    {
      key: "bonus_apple_count",
      label: "Bonus Apple Count",
      category: "reward",
      "default": 0,
      min: 0,
      max: 10,
      step: 1,
      get: function() { try { return window.__snakeBonusCount || 0; } catch(e) { return 0; } },
      set: function(VALUE) { try { window.__snakeBonusCount = VALUE; } catch(e) {} }
    },
    {
      key: "wall_obstacle_count",
      label: "Wall Obstacle Count",
      category: "obstacle",
      "default": 0,
      min: 0,
      max: 5,
      step: 1,
      get: function() { try { return window.__snakeWallCount || 0; } catch(e) { return 0; } },
      set: function(VALUE) { try { window.__snakeWallCount = VALUE; } catch(e) {} }
    },
    {
      key: "apple_growth_points",
      label: "Apple Growth Points",
      category: "reward",
      "default": 1,
      min: 1,
      max: 5,
      step: 1,
      get: function() { try { return window.__appleGrowthPoints || 1; } catch(e) { return 1; } },
      set: function(VALUE) { try { window.__appleGrowthPoints = VALUE; } catch(e) {} }
    },
    {
      key: "snake_initial_length",
      label: "Snake Initial Length",
      category: "difficulty",
      "default": 4,
      min: 1,
      max: 10,
      step: 1,
      get: function() { try { return window.__snakeInitialLength || 4; } catch(e) { return 4; } },
      set: function(VALUE) { try { window.__snakeInitialLength = VALUE; snake.maxCells = VALUE;; } catch(e) {} }
    },
    {
      key: "grid_cell_size",
      label: "Grid Cell Size",
      category: "visual",
      "default": 16,
      min: 8,
      max: 32,
      step: 1,
      get: function() { try { return grid; } catch(e) { return 16; } },
      set: function(VALUE) { try { grid = VALUE; } catch(e) {} }
    },
    {
      key: "speed_burst_amount",
      label: "Speed Burst Amount",
      category: "speed",
      "default": 0,
      min: 0,
      max: 3,
      step: 1,
      get: function() { try { return window.__snakeSpeedBurst || 0; } catch(e) { return 0; } },
      set: function(VALUE) { try { window.__snakeSpeedBurst = VALUE; } catch(e) {} }
    },
    {
      key: "speed_burst_duration",
      label: "Speed Burst Duration",
      category: "speed",
      "default": 0,
      min: 0,
      max: 300,
      step: 10,
      get: function() { try { return window.__snakeSpeedBurstTimer || 0; } catch(e) { return 0; } },
      set: function(VALUE) { try { window.__snakeSpeedBurstTimer = VALUE; } catch(e) {} }
    }
  ];
  window.__gameMods = mods;
  window.__gameModsByKey = {};
  for (var i = 0; i < mods.length; i++) window.__gameModsByKey[mods[i].key] = mods[i];
  window.__engageModKeys = ["game_frame_skip", "bonus_apple_count", "wall_obstacle_count", "apple_growth_points", "snake_initial_length", "speed_burst_amount", "speed_burst_duration"];
  console.log('[GameMods] Registered ' + mods.length + ' mod injectors for snake');
})();
