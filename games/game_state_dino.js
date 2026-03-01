// Game state capture for dino — auto-generated from game_profiles/dino.json
(function () {
  'use strict';
  function read() {
    var s = {};
    try { s["player_x"] = Runner.instance_.tRex.xPos; } catch(e) { s["player_x"] = null; }
    try { s["player_y"] = Runner.instance_.tRex.yPos; } catch(e) { s["player_y"] = null; }
    try { s["player_status"] = Runner.instance_.tRex.status; } catch(e) { s["player_status"] = null; }
    try { s["is_jumping"] = Runner.instance_.tRex.jumping; } catch(e) { s["is_jumping"] = null; }
    try { s["current_speed"] = Runner.instance_.currentSpeed; } catch(e) { s["current_speed"] = null; }
    try { s["score"] = Runner.instance_.distanceMeter.getActualDistance(Runner.instance_.distanceRan); } catch(e) { s["score"] = null; }
    try { s["high_score"] = Runner.instance_.highestScore; } catch(e) { s["high_score"] = null; }
    try { s["game_started"] = Runner.instance_.started; } catch(e) { s["game_started"] = null; }
    try { s["game_crashed"] = Runner.instance_.crashed; } catch(e) { s["game_crashed"] = null; }
    try { s["game_paused"] = Runner.instance_.paused; } catch(e) { s["game_paused"] = null; }
    try { s["obstacle_count"] = Runner.instance_.horizon.obstacles.length; } catch(e) { s["obstacle_count"] = null; }
    try { s["nearest_obstacle_x"] = Runner.instance_.horizon.obstacles.length > 0 ? Runner.instance_.horizon.obstacles[0].xPos : -1; } catch(e) { s["nearest_obstacle_x"] = null; }
    try { s["nearest_obstacle_type"] = Runner.instance_.horizon.obstacles.length > 0 ? Runner.instance_.horizon.obstacles[0].typeConfig.type : 'NONE'; } catch(e) { s["nearest_obstacle_type"] = null; }
    return s;
  }
  if (typeof window !== "undefined") window.getEngageGameState = read;
})();
