// Game state capture for bird — auto-generated from game_profiles/bird.json
(function () {
  'use strict';
  function read() {
    var s = {};
    try { s["player_y_percent"] = ($('#Birdy').offset().top - $('#Canvas').offset().top) / $('#Canvas').height() * 100; } catch(e) { s["player_y_percent"] = null; }
    try { s["player_x_percent"] = ($('#Birdy').offset().left - $('#Canvas').offset().left) / $('#Canvas').width() * 100; } catch(e) { s["player_x_percent"] = null; }
    try { s["pipe_pair_count"] = $('.Pipe').length / 2; } catch(e) { s["pipe_pair_count"] = null; }
    return s;
  }
  if (typeof window !== "undefined") window.getEngageGameState = read;
})();
