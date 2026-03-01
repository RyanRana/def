// Game state capture for dino — auto-generated from game_profiles/dino.json
(function () {
  'use strict';
  function read() {
    var s = {};
    try { s["distance_ran"] = window.Runner.instance_.distanceRan; } catch(e) { s["distance_ran"] = null; }
    try { s["high_score"] = window.Runner.instance_.highestScore; } catch(e) { s["high_score"] = null; }
    try { s["current_speed"] = window.Runner.instance_.currentSpeed; } catch(e) { s["current_speed"] = null; }
    try { s["is_crashed"] = window.Runner.instance_.crashed; } catch(e) { s["is_crashed"] = null; }
    try { s["is_paused"] = window.Runner.instance_.paused; } catch(e) { s["is_paused"] = null; }
    try { s["is_game_active"] = window.Runner.instance_.activated; } catch(e) { s["is_game_active"] = null; }
    try { s["trex_y_pos"] = window.Runner.instance_.tRex.yPos; } catch(e) { s["trex_y_pos"] = null; }
    try { s["trex_is_jumping"] = window.Runner.instance_.tRex.jumping; } catch(e) { s["trex_is_jumping"] = null; }
    try { s["obstacle_count"] = window.Runner.instance_.obstacles.length; } catch(e) { s["obstacle_count"] = null; }
    try { s["nearest_obstacle_x"] = window.Runner.instance_.obstacles.length > 0 ? window.Runner.instance_.obstacles[0].xPos : -1; } catch(e) { s["nearest_obstacle_x"] = null; }
    try { s["game_running_time"] = window.Runner.instance_.runningTime; } catch(e) { s["game_running_time"] = null; }
    return s;
  }
  if (typeof window !== "undefined") window.getEngageGameState = read;
})();
