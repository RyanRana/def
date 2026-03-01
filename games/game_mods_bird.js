// Game mod injectors for bird — auto-generated from game_profiles/bird.json
// window.__gameMods = array of { key, label, category, default, min, max, step, get(), set(v) }
(function () {
  'use strict';
  var mods = [
    {
      key: "gravity_acceleration",
      label: "Gravity Strength",
      category: "gravity",
      "default": 0.3,
      min: 0.1,
      max: 1.0,
      step: 0.05,
      get: function() { try { return window.BirdyConfig.gravAccel; } catch(e) { return 0.3; } },
      set: function(VALUE) { try { window.BirdyConfig.gravAccel = VALUE; } catch(e) {} }
    },
    {
      key: "terminal_velocity",
      label: "Terminal Velocity",
      category: "gravity",
      "default": 5,
      min: 1,
      max: 10,
      step: 0.5,
      get: function() { try { return window.BirdyConfig.terminalVelocity; } catch(e) { return 5; } },
      set: function(VALUE) { try { window.BirdyConfig.terminalVelocity = VALUE; } catch(e) {} }
    },
    {
      key: "jump_height",
      label: "Jump Height",
      category: "player",
      "default": 9,
      min: 3,
      max: 15,
      step: 1,
      get: function() { try { return window.BirdyConfig.jumpHeight; } catch(e) { return 9; } },
      set: function(VALUE) { try { window.BirdyConfig.jumpHeight = VALUE; } catch(e) {} }
    },
    {
      key: "pipe_spawn_interval",
      label: "Pipe Spawn Interval",
      category: "obstacle",
      "default": 60,
      min: 20,
      max: 120,
      step: 5,
      get: function() { try { return window.BirdyConfig.pipeInterval; } catch(e) { return 60; } },
      set: function(VALUE) { try { window.BirdyConfig.pipeInterval = VALUE; } catch(e) {} }
    },
    {
      key: "pipe_gap_size",
      label: "Pipe Gap Size",
      category: "obstacle",
      "default": 30,
      min: 15,
      max: 45,
      step: 1,
      get: function() { try { return window.BirdyConfig.pipeGap; } catch(e) { return 30; } },
      set: function(VALUE) { try { window.BirdyConfig.pipeGap = VALUE; } catch(e) {} }
    },
    {
      key: "pipe_speed",
      label: "Pipe Speed",
      category: "speed",
      "default": 7,
      min: 3,
      max: 15,
      step: 0.5,
      get: function() { try { return window.BirdyConfig.pipeSpeed; } catch(e) { return 7; } },
      set: function(VALUE) { try { window.BirdyConfig.pipeSpeed = VALUE; } catch(e) {} }
    }
  ];
  window.__gameMods = mods;
  window.__gameModsByKey = {};
  for (var i = 0; i < mods.length; i++) window.__gameModsByKey[mods[i].key] = mods[i];
  window.__engageModKeys = ["gravity_acceleration", "terminal_velocity", "jump_height", "pipe_spawn_interval", "pipe_gap_size", "pipe_speed"];
  console.log('[GameMods] Registered ' + mods.length + ' mod injectors for bird');
})();
