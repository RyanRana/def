// Game state capture for bird — auto-generated from game_profiles/bird.json
(function () {
  'use strict';
  function read() {
    var s = {};
    try { s["score"] = window.CurrentScore; } catch(e) { s["score"] = null; }
    try { s["high_score"] = parseInt(localStorage.getItem('birdBest') || '0', 10); } catch(e) { s["high_score"] = null; }
    try { s["game_state"] = window.__birdLost ? 'dead' : ($('#PauseBtn').hasClass('show-play') ? 'paused' : 'playing'); } catch(e) { s["game_state"] = null; }
    try { s["bird_y_position_percent"] = parseFloat($('#Birdy').css('top')); } catch(e) { s["bird_y_position_percent"] = null; }
    try { s["bird_angle_degrees"] = parseFloat($('#Birdy').css('transform').match(/rotate\(([-.\d]+)deg\)/)?.[1] || 0); } catch(e) { s["bird_angle_degrees"] = null; }
    try { s["is_bird_jumping"] = $('#Birdy').is(':animated'); } catch(e) { s["is_bird_jumping"] = null; }
    try { s["total_pipes_on_screen"] = $('.Pipe').length / 2; } catch(e) { s["total_pipes_on_screen"] = null; }
    try { s["nearest_pipe_distance_pixels"] = (function() { var $birdy = $('#Birdy'); var birdRight = $birdy.offset().left + $birdy.width(); var minDistance = Infinity; $('.Pipe').each(function() { var $pipe = $(this); var pipeLeft = $pipe.offset().left; if (pipeLeft > birdRight) { minDistance = Math.min(minDistance, pipeLeft - birdRight); } }); return minDistance === Infinity ? -1 : minDistance; })(); } catch(e) { s["nearest_pipe_distance_pixels"] = null; }
    return s;
  }
  if (typeof window !== "undefined") window.getEngageGameState = read;
})();
