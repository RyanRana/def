// Game mod injectors for dino — auto-generated
(function () {
  'use strict';
  var mods = [
    {
      key: "initial_game_speed",
      label: "Initial Game Speed",
      category: "speed",
      "default": 6,
      min: 1,
      max: 20,
      step: 0.5,
      get: function() { try { return window.Runner.instance_.config.SPEED; } catch(e) { return 6; } },
      set: function(VALUE) { try { window.Runner.instance_.updateConfigSetting('SPEED', VALUE); } catch(e) {} }
    },
    {
      key: "game_acceleration",
      label: "Game Acceleration",
      category: "difficulty",
      "default": 0.001,
      min: 0,
      max: 0.01,
      step: 0.0001,
      get: function() { try { return window.Runner.instance_.config.ACCELERATION; } catch(e) { return 0.001; } },
      set: function(VALUE) { try { window.Runner.instance_.updateConfigSetting('ACCELERATION', VALUE); } catch(e) {} }
    },
    {
      key: "max_game_speed",
      label: "Max Game Speed",
      category: "speed",
      "default": 12,
      min: 6,
      max: 30,
      step: 1,
      get: function() { try { return window.Runner.instance_.config.MAX_SPEED; } catch(e) { return 12; } },
      set: function(VALUE) { try { window.Runner.instance_.updateConfigSetting('MAX_SPEED', VALUE); } catch(e) {} }
    },
    {
      key: "gravity",
      label: "Gravity",
      category: "gravity",
      "default": 0.6,
      min: 0.1,
      max: 2,
      step: 0.1,
      get: function() { try { return window.Runner.instance_.config.GRAVITY; } catch(e) { return 0.6; } },
      set: function(VALUE) { try { window.Runner.instance_.updateConfigSetting('GRAVITY', VALUE); } catch(e) {} }
    },
    {
      key: "initial_jump_velocity",
      label: "Initial Jump Velocity",
      category: "gravity",
      "default": 12,
      min: 5,
      max: 20,
      step: 1,
      get: function() { try { return window.Runner.instance_.config.INITIAL_JUMP_VELOCITY; } catch(e) { return 12; } },
      set: function(VALUE) { try { window.Runner.instance_.updateConfigSetting('INITIAL_JUMP_VELOCITY', VALUE); } catch(e) {} }
    },
    {
      key: "min_jump_height",
      label: "Min Jump Height",
      category: "forgiveness",
      "default": 35,
      min: 10,
      max: 100,
      step: 5,
      get: function() { try { return window.Runner.instance_.config.MIN_JUMP_HEIGHT; } catch(e) { return 35; } },
      set: function(VALUE) { try { window.Runner.instance_.updateConfigSetting('MIN_JUMP_HEIGHT', VALUE); } catch(e) {} }
    },
    {
      key: "speed_drop_coefficient",
      label: "Speed Drop Coefficient",
      category: "gravity",
      "default": 3,
      min: 1,
      max: 10,
      step: 1,
      get: function() { try { return window.Runner.instance_.config.SPEED_DROP_COEFFICIENT; } catch(e) { return 3; } },
      set: function(VALUE) { try { window.Runner.instance_.updateConfigSetting('SPEED_DROP_COEFFICIENT', VALUE); } catch(e) {} }
    },
    {
      key: "obstacle_gap_coefficient",
      label: "Obstacle Gap Coefficient",
      category: "obstacle",
      "default": 0.6,
      min: 0.1,
      max: 2,
      step: 0.1,
      get: function() { try { return window.Runner.instance_.config.GAP_COEFFICIENT; } catch(e) { return 0.6; } },
      set: function(VALUE) { try { window.Runner.instance_.updateConfigSetting('GAP_COEFFICIENT', VALUE); } catch(e) {} }
    },
    {
      key: "max_clouds",
      label: "Max Clouds",
      category: "visual",
      "default": 6,
      min: 0,
      max: 20,
      step: 1,
      get: function() { try { return window.Runner.instance_.config.MAX_CLOUDS; } catch(e) { return 6; } },
      set: function(VALUE) { try { window.Runner.instance_.config.MAX_CLOUDS = VALUE; } catch(e) {} }
    },
    {
      key: "cloud_frequency",
      label: "Cloud Frequency",
      category: "visual",
      "default": 0.5,
      min: 0,
      max: 1,
      step: 0.1,
      get: function() { try { return window.Runner.instance_.config.CLOUD_FREQUENCY; } catch(e) { return 0.5; } },
      set: function(VALUE) { try { window.Runner.instance_.config.CLOUD_FREQUENCY = VALUE; } catch(e) {} }
    },
    {
      key: "achievement_distance",
      label: "Achievement Distance",
      category: "reward",
      "default": 100,
      min: 10,
      max: 500,
      step: 10,
      get: function() { try { return window.Runner.instance_.distanceMeter.config.ACHIEVEMENT_DISTANCE; } catch(e) { return 100; } },
      set: function(VALUE) { try { window.Runner.instance_.distanceMeter.config.ACHIEVEMENT_DISTANCE = VALUE; } catch(e) {} }
    },
    {
      key: "score_conversion_coefficient",
      label: "Score Conversion Coefficient",
      category: "reward",
      "default": 0.025,
      min: 0.005,
      max: 0.1,
      step: 0.005,
      get: function() { try { return window.Runner.instance_.distanceMeter.config.COEFFICIENT; } catch(e) { return 0.025; } },
      set: function(VALUE) { try { window.Runner.instance_.distanceMeter.config.COEFFICIENT = VALUE; } catch(e) {} }
    },
    {
      key: "gameover_clear_time",
      label: "Game Over Clear Time",
      category: "forgiveness",
      "default": 750,
      min: 0,
      max: 2000,
      step: 50,
      get: function() { try { return window.Runner.instance_.config.GAMEOVER_CLEAR_TIME; } catch(e) { return 750; } },
      set: function(VALUE) { try { window.Runner.instance_.config.GAMEOVER_CLEAR_TIME = VALUE; } catch(e) {} }
    }
  ];
  window.__gameMods = mods;
  window.__gameModsByKey = {};
  for (var i = 0; i < mods.length; i++) window.__gameModsByKey[mods[i].key] = mods[i];
  window.__engageModKeys = ["initial_game_speed","game_acceleration","gravity","initial_jump_velocity","obstacle_gap_coefficient","gameover_clear_time","achievement_distance"];
  console.log('[GameMods] Registered ' + mods.length + ' mods for dino');
})();
