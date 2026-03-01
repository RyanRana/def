/**
 * EngageTracker: 1 Hz time-series with raw levels + derived in-round fields for true time series.
 * Vector: [heartRate, breathingRate, expressionIdx, sessionTimeSec, score, deaths, tapCount, activeTouchMs,
 *          scoreDelta, hrDelta, brDelta, deathsDelta, touchRatio, deathRate60s]
 * Each row may also include gameState: {} from window.getEngageGameState() when present.
 *
 * Vitals from in-browser inference (webcam rPPG). Deltas and rates are computed per tick.
 */
(function (global) {
  'use strict';

  var FIELDS = [
    'heartRate',      // BPM from inference (0 if unavailable)
    'breathingRate',  // RPM from inference (0 if unavailable)
    'expressionIdx',  // 0=none 1=neutral 2=happy 3=sad 4=angry 5=fear 6=calm
    'sessionTimeSec', // seconds since tracker start
    'score',          // raw game score
    'deaths',         // total death count
    'tapCount',       // taps (touch) or keydown events in the last tick window
    'activeTouchMs',  // ms any touch/key was held during last tick
    'scoreDelta',     // change in score since previous tick (per-second velocity)
    'hrDelta',        // change in heart rate since previous tick
    'brDelta',        // change in breathing rate since previous tick
    'deathsDelta',    // deaths in last tick (0 or 1 typically)
    'touchRatio',     // activeTouchMs/1000, fraction of last second with input active (0..1)
    'deathRate60s',   // deaths in the last 60 seconds (rolling)
    'keyVelocity',    // keys per second in this tick window
    'keyRhythm',      // regularity of key timing (0=erratic, 1=steady)
    'faceMovement',   // face region pixel change 0-1 (arousal proxy)
    'emotionValence'  // -1 to 1 emotion estimate from face (neg=stressed, pos=happy)
  ];

  var EXPRESSION_MAP = {
    'neutral': 1,
    'happy': 2, 'smile': 2,
    'sad': 3,
    'angry': 4,
    'fear': 5,
    'calm': 6, 'relaxed': 6
  };

  function expressionToIdx(expression) {
    if (!expression) return 0;
    var e = expression.toLowerCase();
    var keys = Object.keys(EXPRESSION_MAP);
    for (var i = 0; i < keys.length; i++) {
      if (e.indexOf(keys[i]) !== -1) return EXPRESSION_MAP[keys[i]];
    }
    return 0;
  }

  function getLatestVitals() {
    if (typeof window !== 'undefined' && window.__inferenceVitals) {
      return window.__inferenceVitals;
    }
    return null;
  }

  /**
   * @param {Object} options
   * @param {number} [options.intervalMs=1000]
   * @param {function(): number} [options.getScore]
   * @param {function(): number} [options.getDeaths]
   * @param {function(number[]): void} [options.onTick]
   */
  function EngageTracker(options) {
    options = options || {};
    this.intervalMs = options.intervalMs !== undefined ? options.intervalMs : 1000;
    this.timeSeries = [];
    this.sessionStart = Date.now();
    this._intervalId = null;
    this._gameGetScore = options.getScore || function () { return 0; };
    this._gameGetDeaths = options.getDeaths || function () { return 0; };
    this._onTick = options.onTick || null;

    // Input state (touch on mobile, keyboard on desktop)
    this._tapCount = 0;
    this._keysHeld = {};
    this._activeTouchMs = 0;
    this._touchStartTime = 0;
    this._isTouching = false;
    this._lastTickTime = Date.now();
    this._isMobile = typeof window !== 'undefined' && 'ontouchstart' in window;
    this._boundHandlers = {};
    this._keyTimestamps = [];     // timestamps of recent key presses for rhythm analysis
    // Previous tick values for deltas; rolling window for death rate
    this._prevScore = 0;
    this._prevDeaths = 0;
    this._prevHr = null;
    this._prevBr = null;
    this._deathDeltas = [];
  }

  EngageTracker.prototype._startInputTracking = function () {
    var self = this;

    if (this._isMobile) {
      // Mobile: track touch events
      this._boundHandlers.touchStart = function (e) {
        self._tapCount++;
        self._touchStartTime = Date.now();
        self._isTouching = true;
      };
      this._boundHandlers.touchEnd = function (e) {
        if (self._isTouching) {
          self._activeTouchMs += Date.now() - self._touchStartTime;
          self._isTouching = false;
        }
      };
      this._boundHandlers.visibilityChange = function () {
        if (document.hidden && self._isTouching) {
          self._activeTouchMs += Date.now() - self._touchStartTime;
          self._isTouching = false;
        }
      };
      document.addEventListener('touchstart', this._boundHandlers.touchStart, { passive: true });
      document.addEventListener('touchend', this._boundHandlers.touchEnd, { passive: true });
      document.addEventListener('visibilitychange', this._boundHandlers.visibilityChange);
    } else {
      // Desktop: keep existing keyboard tracking as fallback
      this._boundHandlers.keyDown = function (e) {
        if (e.repeat) return;
        self._tapCount++;
        var now = Date.now();
        self._keysHeld[e.code] = now;
        self._keyTimestamps.push(now);
      };
      this._boundHandlers.keyUp = function (e) {
        if (self._keysHeld[e.code]) {
          self._activeTouchMs += Date.now() - self._keysHeld[e.code];
          delete self._keysHeld[e.code];
        }
      };
      this._boundHandlers.blur = function () {
        var now = Date.now();
        var codes = Object.keys(self._keysHeld);
        for (var i = 0; i < codes.length; i++) {
          self._activeTouchMs += now - self._keysHeld[codes[i]];
        }
        self._keysHeld = {};
      };
      document.addEventListener('keydown', this._boundHandlers.keyDown);
      document.addEventListener('keyup', this._boundHandlers.keyUp);
      window.addEventListener('blur', this._boundHandlers.blur);
    }
  };

  EngageTracker.prototype._stopInputTracking = function () {
    if (this._isMobile) {
      if (this._boundHandlers.touchStart) document.removeEventListener('touchstart', this._boundHandlers.touchStart);
      if (this._boundHandlers.touchEnd) document.removeEventListener('touchend', this._boundHandlers.touchEnd);
      if (this._boundHandlers.visibilityChange) document.removeEventListener('visibilitychange', this._boundHandlers.visibilityChange);
    } else {
      if (this._boundHandlers.keyDown) document.removeEventListener('keydown', this._boundHandlers.keyDown);
      if (this._boundHandlers.keyUp) document.removeEventListener('keyup', this._boundHandlers.keyUp);
      if (this._boundHandlers.blur) window.removeEventListener('blur', this._boundHandlers.blur);
    }
    this._boundHandlers = {};
  };

  EngageTracker.prototype._flushInput = function () {
    var now = Date.now();
    var elapsed = now - this._lastTickTime;
    this._lastTickTime = now;

    if (this._isMobile) {
      // Credit time for ongoing touch
      if (this._isTouching) {
        this._activeTouchMs += now - this._touchStartTime;
        this._touchStartTime = now; // reset checkpoint
      }
    } else {
      // Flush still-held keys
      var codes = Object.keys(this._keysHeld);
      for (var i = 0; i < codes.length; i++) {
        this._activeTouchMs += now - this._keysHeld[codes[i]];
        this._keysHeld[codes[i]] = now;
      }
    }

    var presses = this._tapCount;
    var heldMs = Math.min(Math.round(this._activeTouchMs), Math.round(elapsed));

    // Key velocity: presses per second
    var keyVelocity = elapsed > 0 ? Math.round(presses / (elapsed / 1000) * 100) / 100 : 0;

    // Key rhythm: coefficient of variation of inter-key intervals (inverted, 0=erratic 1=steady)
    var rhythm = 0;
    var kts = this._keyTimestamps;
    if (kts.length >= 3) {
      var intervals = [];
      for (var k = 1; k < kts.length; k++) intervals.push(kts[k] - kts[k - 1]);
      var mean = 0;
      for (var k = 0; k < intervals.length; k++) mean += intervals[k];
      mean /= intervals.length;
      if (mean > 0) {
        var variance = 0;
        for (var k = 0; k < intervals.length; k++) variance += (intervals[k] - mean) * (intervals[k] - mean);
        variance /= intervals.length;
        var cv = Math.sqrt(variance) / mean;
        rhythm = Math.max(0, Math.min(1, 1 - cv));
      }
    }

    this._tapCount = 0;
    this._activeTouchMs = 0;
    this._keyTimestamps = [];
    return { keyPresses: presses, activeInputMs: heldMs, keyVelocity: keyVelocity, keyRhythm: rhythm };
  };

  EngageTracker.prototype.start = function () {
    if (this._intervalId) return;
    this.sessionStart = Date.now();
    this._lastTickTime = Date.now();
    this._startInputTracking();
    var self = this;
    this._intervalId = setInterval(function () { self.tick(); }, this.intervalMs);
  };

  EngageTracker.prototype.stop = function () {
    if (this._intervalId) {
      clearInterval(this._intervalId);
      this._intervalId = null;
    }
    this._stopInputTracking();
  };

  EngageTracker.prototype._isActive = function () {
    if (typeof document !== 'undefined' && document.hidden) return false;
    var gs = typeof window !== 'undefined' && window.getEngageGameState;
    if (typeof gs === 'function') {
      try {
        var s = gs();
        if (s && (s.crashed === true || s.game_over === true || s.lost === true || s.playing === false)) return false;
      } catch (e) {}
    }
    return true;
  };

  EngageTracker.prototype.tick = function () {
    if (!this._isActive()) return null;

    var now = Date.now();
    var sessionTimeSec = Math.round((now - this.sessionStart) / 1000);
    var score = this._gameGetScore();
    var deaths = this._gameGetDeaths();

    var vitals = getLatestVitals();
    var hr = vitals && vitals.heartRate != null ? vitals.heartRate : 0;
    var br = vitals && vitals.breathingRate != null ? vitals.breathingRate : 0;
    var exprIdx = vitals ? expressionToIdx(vitals.expression) : 0;

    var input = this._flushInput();
    var activeTouchMs = input.activeInputMs;
    var tapCount = input.keyPresses;

    // Deltas (use null for first-tick HR/BR so we don't fake a delta)
    var scoreDelta = score - this._prevScore;
    var deathsDelta = deaths - this._prevDeaths;
    var hrDelta = this._prevHr != null ? hr - this._prevHr : 0;
    var brDelta = this._prevBr != null ? br - this._prevBr : 0;

    this._prevScore = score;
    this._prevDeaths = deaths;
    this._prevHr = hr;
    this._prevBr = br;

    this._deathDeltas.push(deathsDelta);
    var maxDeathWindow = Math.ceil(60000 / this.intervalMs);
    if (this._deathDeltas.length > maxDeathWindow) this._deathDeltas.shift();
    var deathRate60s = this._deathDeltas.reduce(function (a, b) { return a + b; }, 0);

    var touchRatio = Math.min(1, activeTouchMs / Math.max(this.intervalMs, 100));

    // Face signals from inference
    var faceMovement = vitals && vitals.faceMovement != null ? vitals.faceMovement : 0;
    var emotionValence = vitals && vitals.emotionValence != null ? vitals.emotionValence : 0;

    var vector = [
      Math.round(hr * 100) / 100,
      Math.round(br * 100) / 100,
      exprIdx,
      sessionTimeSec,
      score,
      deaths,
      tapCount,
      activeTouchMs,
      scoreDelta,
      hrDelta,
      brDelta,
      deathsDelta,
      Math.round(touchRatio * 1000) / 1000,
      deathRate60s,
      input.keyVelocity,
      Math.round(input.keyRhythm * 100) / 100,
      Math.round(faceMovement * 1000) / 1000,
      Math.round(emotionValence * 100) / 100
    ];

    var gameState = null;
    if (typeof global !== 'undefined' && global.getEngageGameState) {
      try {
        gameState = global.getEngageGameState();
      } catch (e) {}
    }
    var row = { vector: vector, gameState: gameState };
    this.timeSeries.push(row);
    if (this._onTick) this._onTick(row);
    return row;
  };

  EngageTracker.prototype.getTimeSeries = function () {
    return this.timeSeries;
  };

  EngageTracker.prototype.getLastVector = function () {
    var last = this.timeSeries.length ? this.timeSeries[this.timeSeries.length - 1] : null;
    return last && last.vector ? last.vector : last;
  };

  EngageTracker.prototype.getLastRow = function () {
    return this.timeSeries.length ? this.timeSeries[this.timeSeries.length - 1] : null;
  };

  EngageTracker.prototype.exportCSV = function () {
    var header = FIELDS.join(',');
    var rows = this.timeSeries.map(function (row) {
      var v = row && row.vector ? row.vector : row;
      return Array.isArray(v) ? v.join(',') : '';
    });
    return [header].concat(rows).join('\n');
  };

  EngageTracker.prototype.downloadCSV = function (filename) {
    filename = filename || 'engage-timeseries.csv';
    var csv = this.exportCSV();
    var blob = new Blob([csv], { type: 'text/csv' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  EngageTracker.prototype.clear = function () {
    this.timeSeries = [];
    this._prevScore = 0;
    this._prevDeaths = 0;
    this._prevHr = null;
    this._prevBr = null;
    this._deathDeltas = [];
  };

  EngageTracker.FIELDS = FIELDS;
  EngageTracker.EXPRESSION_MAP = EXPRESSION_MAP;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = EngageTracker;
  } else {
    global.EngageTracker = EngageTracker;
    global.PRESAGE_FIELDS = FIELDS;
  }
})(typeof window !== 'undefined' ? window : globalThis);
