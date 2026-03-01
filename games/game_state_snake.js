// Game state capture for snake — auto-generated from game_profiles/snake.json
(function () {
  'use strict';
  function read() {
    var s = {};
    try { s["snake_x"] = snake.x; } catch(e) { s["snake_x"] = null; }
    try { s["snake_y"] = snake.y; } catch(e) { s["snake_y"] = null; }
    try { s["snake_velocity_x"] = snake.dx; } catch(e) { s["snake_velocity_x"] = null; }
    try { s["snake_velocity_y"] = snake.dy; } catch(e) { s["snake_velocity_y"] = null; }
    try { s["snake_body_length"] = snake.cells.length; } catch(e) { s["snake_body_length"] = null; }
    try { s["apples_eaten"] = snake.maxCells - 4; } catch(e) { s["apples_eaten"] = null; }
    try { s["apple_x"] = apple.x; } catch(e) { s["apple_x"] = null; }
    try { s["apple_y"] = apple.y; } catch(e) { s["apple_y"] = null; }
    try { s["bonus_apples"] = bonusApples ? bonusApples.length : 0; } catch(e) { s["bonus_apples"] = 0; }
    try { s["wall_count"] = walls ? walls.length : 0; } catch(e) { s["wall_count"] = 0; }
    try { s["speed_burst"] = window.__snakeSpeedBurst || 0; } catch(e) { s["speed_burst"] = 0; }
    return s;
  }
  if (typeof window !== "undefined") window.getEngageGameState = read;
})();
