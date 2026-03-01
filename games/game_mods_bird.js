// Game mod injectors for bird — auto-generated
(function () {
  'use strict';
  var mods = [
    {
      key: "gravity_acceleration",
      label: "Gravity Acceleration",
      category: "gravity",
      "default": 0.3,
      min: 0.1,
      max: 1,
      step: 0.05,
      get: function() { try { return window.BirdyConfig.gravAccel; } catch(e) { return 0.3; } },
      set: function(VALUE) { try { window.BirdyConfig.gravAccel = VALUE; } catch(e) {} }
    },
    {
      key: "terminal_velocity",
      label: "Terminal Velocity",
      category: "gravity",
      "default": 5,
      min: 2,
      max: 10,
      step: 0.5,
      get: function() { try { return window.BirdyConfig.terminalVelocity; } catch(e) { return 5; } },
      set: function(VALUE) { try { window.BirdyConfig.terminalVelocity = VALUE; } catch(e) {} }
    },
    {
      key: "jump_height",
      label: "Jump Height",
      category: "player_ability",
      "default": 9,
      min: 3,
      max: 15,
      step: 1,
      get: function() { try { return window.BirdyConfig.jumpHeight; } catch(e) { return 9; } },
      set: function(VALUE) { try { window.BirdyConfig.jumpHeight = VALUE; } catch(e) {} }
    },
    {
      key: "pipe_spawn_interval_loops",
      label: "Pipe Spawn Interval",
      category: "obstacle",
      "default": 60,
      min: 40,
      max: 120,
      step: 5,
      get: function() { try { return window.BirdyConfig.pipeInterval; } catch(e) { return 60; } },
      set: function(VALUE) { try { window.BirdyConfig.pipeInterval = VALUE; } catch(e) {} },
      invert: true
    },
    {
      key: "canvas_width",
      label: "Canvas Width",
      category: "difficulty",
      "default": 500,
      min: 200,
      max: 800,
      step: 50,
      get: function() { try { return $('#Canvas').width(); } catch(e) { return 500; } },
      set: function(VALUE) { try { $('#Canvas').width(VALUE); } catch(e) {} }
    },
    {
      key: "canvas_height",
      label: "Canvas Height",
      category: "difficulty",
      "default": 400,
      min: 200,
      max: 600,
      step: 50,
      get: function() { try { return $('#Canvas').height(); } catch(e) { return 400; } },
      set: function(VALUE) { try { $('#Canvas').height(VALUE); } catch(e) {} }
    },
    {
      key: "bird_width",
      label: "Bird Width",
      category: "difficulty",
      "default": 50,
      min: 20,
      max: 100,
      step: 5,
      get: function() { try { return $('#Birdy').width(); } catch(e) { return 50; } },
      set: function(VALUE) { try { $('#Birdy').width(VALUE); } catch(e) {} }
    },
    {
      key: "bird_height",
      label: "Bird Height",
      category: "difficulty",
      "default": 35,
      min: 15,
      max: 70,
      step: 5,
      get: function() { try { return $('#Birdy').height(); } catch(e) { return 35; } },
      set: function(VALUE) { try { $('#Birdy').height(VALUE); } catch(e) {} }
    },
    {
      key: "pipe_gap_size",
      label: "Pipe Gap",
      category: "obstacle",
      "default": 30,
      min: 18,
      max: 45,
      step: 2,
      get: function() { try { return window.BirdyConfig.pipeGap != null ? window.BirdyConfig.pipeGap : 30; } catch(e) { return 30; } },
      set: function(VALUE) { try { window.BirdyConfig.pipeGap = VALUE; } catch(e) {} }
    },
    {
      key: "pipe_speed",
      label: "Pipe Speed",
      category: "speed",
      "default": 7,
      min: 4,
      max: 18,
      step: 1,
      get: function() { try { return window.BirdyConfig.pipeSpeed != null ? window.BirdyConfig.pipeSpeed : 7; } catch(e) { return 7; } },
      set: function(VALUE) { try { window.BirdyConfig.pipeSpeed = VALUE; } catch(e) {} },
      invert: true
    }
  ];
  window.__gameMods = mods;
  window.__gameModsByKey = {};
  for (var i = 0; i < mods.length; i++) window.__gameModsByKey[mods[i].key] = mods[i];
  window.__engageModKeys = ["gravity_acceleration","jump_height","pipe_spawn_interval_loops","pipe_gap_size","pipe_speed"];
  console.log('[GameMods] Registered ' + mods.length + ' mods for bird (' + window.__engageModKeys.length + ' engagement levers)');
})();
