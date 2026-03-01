// Game state capture for snake — auto-generated from game_profiles/snake.json
(function () {
  'use strict';
  function read() {
    var s = {};
    try { s["snake_x"] = snake.x; } catch(e) { s["snake_x"] = null; }
    try { s["snake_y"] = snake.y; } catch(e) { s["snake_y"] = null; }
    try { s["snake_velocity_x"] = snake.dx; } catch(e) { s["snake_velocity_x"] = null; }
    try { s["snake_velocity_y"] = snake.dy; } catch(e) { s["snake_velocity_y"] = null; }
    try { s["snake_current_length"] = snake.cells.length; } catch(e) { s["snake_current_length"] = null; }
    try { s["snake_target_length"] = snake.maxCells; } catch(e) { s["snake_target_length"] = null; }
    try { s["apple_x"] = apple.x; } catch(e) { s["apple_x"] = null; }
    try { s["apple_y"] = apple.y; } catch(e) { s["apple_y"] = null; }
    try { s["bonus_apples_on_screen"] = bonusApples.length; } catch(e) { s["bonus_apples_on_screen"] = null; }
    try { s["wall_obstacles_on_screen"] = walls.length; } catch(e) { s["wall_obstacles_on_screen"] = null; }
    try { s["is_speed_burst_active"] = window.__snakeSpeedBurst > 0 && window.__snakeSpeedBurstTimer > 0; } catch(e) { s["is_speed_burst_active"] = null; }
    try { s["speed_burst_timer_frames"] = window.__snakeSpeedBurstTimer; } catch(e) { s["speed_burst_timer_frames"] = null; }
    try {
      var baseSkip = window.__snakeFrameSkip != null ? window.__snakeFrameSkip : 3;
      s["effective_frame_skip"] = (window.__snakeSpeedBurst > 0 && window.__snakeSpeedBurstTimer > 0) ? Math.max(1, baseSkip - window.__snakeSpeedBurst) : baseSkip;
    } catch(e) { s["effective_frame_skip"] = null; }
    return s;
  }
  if (typeof window !== "undefined") window.getEngageGameState = read;
})();
