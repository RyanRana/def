/**
 * Engage logger: one-line terminal/console output, values only.
 * Mod applications in red with transparent "what + why" (real-time data → LLM-friendly interpretation).
 */
(function (global) {
  'use strict';

  var LOG_URL = null;

  function tickLine(vector, gameState) {
    var parts = [];
    if (vector && vector.length) {
      for (var i = 0; i < vector.length; i++) {
        var v = vector[i];
        parts.push(typeof v === 'number' ? (v % 1 === 0 ? String(v) : v.toFixed(2)) : (v == null ? '' : v));
      }
    }
    if (gameState && typeof gameState === 'object') {
      var flat = [];
      for (var k in gameState) { if (gameState.hasOwnProperty(k)) flat.push(gameState[k]); }
      if (flat.length) parts.push('|', flat.join('\t'));
    }
    return parts.join('\t');
  }

  var stateDescriptions = {
    bored: 'Player seems bored',
    frustrated: 'Player appears frustrated',
    excited: 'Player is highly engaged',
    flow: 'Player is in flow',
    disengaged: 'Player is disengaged'
  };

  function modWhy(opts) {
    var state = opts.state || 'flow';
    var score = opts.engagementScore != null ? opts.engagementScore.toFixed(2) : '—';
    var touch = opts.touchRatio != null ? opts.touchRatio.toFixed(2) : '—';
    var deaths60 = opts.deaths60 != null ? opts.deaths60.toFixed(1) : '—';
    var scoreDel = opts.scoreDelta != null ? opts.scoreDelta.toFixed(2) : '—';
    var thompson = opts.thompson != null ? opts.thompson.toFixed(2) : '—';
    var exp = opts.experiencesCount != null ? opts.experiencesCount : 0;
    var kind = opts.kind || 'plan';
    var desc = stateDescriptions[state] || 'Player is in flow';

    if (kind === 'probe') {
      var reason = desc + ' (engagement ' + score + '). ';
      if (parseFloat(touch) < 0.15) reason += 'Low input activity. ';
      else if (parseFloat(touch) > 0.4) reason += 'High input activity. ';
      if (parseFloat(deaths60) > 2) reason += 'Frequent deaths (' + deaths60 + '/min). ';
      reason += 'Testing this change for 3s to measure response.';
      return reason;
    }
    if (kind === 'reaction') {
      var r = opts.reactionScore != null ? opts.reactionScore : 0;
      var verdict = r > 0.1 ? 'Positive response — keeping direction.' : r < -0.1 ? 'Negative response — will try different approach.' : 'Neutral response — exploring further.';
      return verdict + ' (' + exp + ' data points collected)';
    }

    var parts = [desc + '.'];
    if (parseFloat(touch) < 0.15) parts.push('Input is very low — player may not be actively playing.');
    if (parseFloat(deaths60) > 3) parts.push('High death rate (' + deaths60 + '/min) suggests difficulty is too high.');
    if (parseFloat(scoreDel) > 2) parts.push('Score is climbing steadily — player is progressing well.');
    if (parseFloat(scoreDel) < -1) parts.push('Score progress has stalled.');
    parts.push('Engagement: ' + score + '/1.0 | Confidence: ' + thompson + ' (' + exp + ' observations)');
    return parts.join(' ');
  }

  function modLine(label, fromVal, toVal, why) {
    var fromStr = typeof fromVal === 'number' ? (fromVal % 1 === 0 ? String(fromVal) : fromVal.toFixed(2)) : fromVal;
    var toStr = typeof toVal === 'number' ? (toVal % 1 === 0 ? String(toVal) : toVal.toFixed(2)) : toVal;
    return 'MOD\t' + label + '\t' + fromStr + ' → ' + toStr + '\tWhy: ' + why;
  }

  function logTick(vector, gameState) {
    var line = tickLine(vector, gameState);
    if (typeof console !== 'undefined' && console.log) console.log(line);
  }

  var onModCallback = null;

  function logMod(label, fromVal, toVal, why, opts) {
    opts = opts || {};
    var line = modLine(label, fromVal, toVal, why);
    if (typeof onModCallback === 'function') onModCallback(label, fromVal, toVal, why, line);
    if (typeof console !== 'undefined' && console.log) {
      console.log('%c' + line, 'color:red; font-weight:bold;');
    }
    if (LOG_URL && typeof fetch !== 'undefined') {
      try {
        fetch(LOG_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'mod', message: line })
        }).catch(function () {});
      } catch (e) {}
    }
  }

  function setLogUrl(url) {
    LOG_URL = url || null;
  }

  global.EngageLogger = {
    tickLine: tickLine,
    modLine: modLine,
    modWhy: modWhy,
    logTick: logTick,
    logMod: logMod,
    setLogUrl: setLogUrl,
    set onMod(fn) { onModCallback = typeof fn === 'function' ? fn : null; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
