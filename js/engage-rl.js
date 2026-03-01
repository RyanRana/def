/**
 * Engage RL Engine v2: Adaptive engagement maximizer.
 *
 * Architecture:
 *   1. Engagement State Detector — classifies player into: FLOW, BORED, FRUSTRATED, EXCITED, DISENGAGED
 *      using rolling windows over the 14-vector (no LLM, pure signal processing).
 *   2. Policy Controller — for each engagement state, a hand-tuned policy maps to mod adjustments
 *      using the generated __gameMods registry. This is a rule-based "expert policy" that the
 *      bandit layer learns to weight.
 *   3. Contextual Bandit — UCB1 over policy variants, learns online which adjustments actually
 *      increase session time / reduce quit probability. Updates every decision cycle.
 *   4. Mod Executor — reads __gameMods (generated per-game), applies computed deltas, logs everything.
 *
 * The system is game-agnostic: it reads whatever mods are in __gameMods and applies adjustments
 * by category (speed, gravity, obstacle, reward, difficulty, forgiveness).
 *
 * Runs every DECISION_INTERVAL ticks (~3s at 500ms tick rate). Each decision:
 *   - Classify engagement state from recent history
 *   - Pick a policy arm via UCB1
 *   - Compute mod deltas from the policy
 *   - Apply via __gameMods[key].set(newValue)
 *   - Observe reward (Δ engagement score) for bandit update
 */
(function (global) {
  'use strict';

  // === CONSTANTS ===
  var WARMUP_TICKS = 12;     // no decisions for first N ticks (~6s at 500ms tick)
  var DECISION_INTERVAL = 6; // ticks between decisions (~3s at 500ms tick)
  var HISTORY_WINDOW = 20;   // rolling window for engagement signals (10s at 500ms)
  var EXPLORE_RATE = 0.15;   // UCB exploration vs exploitation
  var BANDIT_C = 1.4;        // UCB1 confidence parameter

  // Engagement states
  var FLOW = 'flow';
  var BORED = 'bored';
  var FRUSTRATED = 'frustrated';
  var EXCITED = 'excited';
  var DISENGAGED = 'disengaged';

  // Vector indices (from engage-tracker FIELDS)
  var I_HR = 0, I_BR = 1, I_EXPR = 2, I_SESS = 3, I_SCORE = 4, I_DEATHS = 5;
  var I_TAPS = 6, I_TOUCH_MS = 7, I_DSCORE = 8, I_DHR = 9, I_DBR = 10;
  var I_DDEATH = 11, I_TOUCH_R = 12, I_DEATH60 = 13;
  var I_KEY_VEL = 14, I_KEY_RHYTHM = 15, I_FACE_MOVE = 16, I_EMOTION = 17;

  // === STATE ===
  var history = [];       // last N rows {vector, gameState}
  var tickCount = 0;
  var lastEngagementState = FLOW;
  var lastEngagementScore = 0.5;
  var smoothedEngScore = 0.5;   // EMA-smoothed engagement score
  var EMA_ALPHA = 0.45;         // smoothing factor (higher = more responsive)
  var pendingState = FLOW;      // candidate state before hysteresis confirms
  var pendingStateCount = 0;    // how many consecutive classifications agree
  var HYSTERESIS_COUNT = 2;     // require N consecutive before switching
  var modBaselines = {};  // key -> default value, set on first read
  var banditArms = {};    // armName -> {pulls, totalReward, lastReward}
  var prevEngagementScore = 0.5;
  var sessionPeakScore = 0;
  var consecutiveBored = 0;
  var consecutiveFrustrated = 0;

  // === ENGAGEMENT STATE DETECTOR ===

  function mean(arr) {
    if (!arr.length) return 0;
    var s = 0;
    for (var i = 0; i < arr.length; i++) s += arr[i];
    return s / arr.length;
  }

  function trend(arr) {
    if (arr.length < 3) return 0;
    var recent = mean(arr.slice(-3));
    var older = mean(arr.slice(0, Math.min(3, arr.length)));
    return recent - older;
  }

  function classifyEngagement(hist) {
    if (hist.length < 3) return { state: FLOW, score: 0.5, signals: {} };
    var touchRatios = [], scoreDels = [], deathDels = [], hrDels = [], death60s = [], taps = [];
    var keyVels = [], keyRhythms = [], faceMoves = [], emotions = [];
    for (var i = 0; i < hist.length; i++) {
      var v = hist[i].vector || hist[i];
      if (!v || !v.length) continue;
      touchRatios.push(v[I_TOUCH_R] || 0);
      scoreDels.push(v[I_DSCORE] || 0);
      deathDels.push(v[I_DDEATH] || 0);
      hrDels.push(v[I_DHR] || 0);
      death60s.push(v[I_DEATH60] || 0);
      taps.push(v[I_TAPS] || 0);
      keyVels.push(v[I_KEY_VEL] || 0);
      keyRhythms.push(v[I_KEY_RHYTHM] || 0);
      faceMoves.push(v[I_FACE_MOVE] || 0);
      emotions.push(v[I_EMOTION] || 0);
    }

    var avgTouch = mean(touchRatios);
    var avgScoreDel = mean(scoreDels);
    var touchTrend = trend(touchRatios);
    var scoreTrend = trend(scoreDels);
    var avgDeath60 = mean(death60s);
    var avgTaps = mean(taps);
    var recentDeaths = mean(deathDels.slice(-10));
    var hrVolatility = Math.abs(mean(hrDels.slice(-10)));
    var hrTrend = mean(hrDels);
    var avgKeyVel = mean(keyVels);
    var avgKeyRhythm = mean(keyRhythms);
    var avgFaceMove = mean(faceMoves);
    var avgEmotion = mean(emotions);

    var rawScore = 0.5;
    rawScore += Math.min(0.2, avgTouch * 0.3);
    rawScore += Math.min(0.15, avgScoreDel * 0.02);
    rawScore -= Math.min(0.3, avgDeath60 * 0.06);
    rawScore += Math.min(0.1, touchTrend * 0.5);
    rawScore += Math.min(0.1, scoreTrend * 0.03);
    rawScore -= Math.min(0.12, recentDeaths * 0.12);
    rawScore += Math.min(0.08, avgFaceMove * 0.5);
    rawScore += Math.min(0.08, avgEmotion * 0.1);
    rawScore += Math.min(0.05, avgKeyRhythm * 0.1);
    rawScore += Math.min(0.06, avgKeyVel * 0.04);
    rawScore += Math.min(0.05, Math.max(-0.05, hrTrend * -0.03));
    rawScore = Math.max(0, Math.min(1, rawScore));

    smoothedEngScore = EMA_ALPHA * rawScore + (1 - EMA_ALPHA) * smoothedEngScore;
    var engScore = smoothedEngScore;

    var candidateState = FLOW;
    if (avgTouch < 0.15 && avgTaps < 1.5 && touchTrend <= 0) {
      candidateState = avgDeath60 > 2 ? DISENGAGED : BORED;
    } else if (avgDeath60 > 3 || recentDeaths > 0.4) {
      candidateState = FRUSTRATED;
    } else if (avgScoreDel > 3 && avgTouch > 0.3 && (hrVolatility > 0.8 || avgFaceMove > 0.08)) {
      candidateState = EXCITED;
    } else if (engScore > 0.55 && avgTouch > 0.2) {
      candidateState = FLOW;
    } else if (scoreTrend < -1 && touchTrend < 0) {
      candidateState = BORED;
    }

    if (candidateState === pendingState) {
      pendingStateCount++;
    } else {
      pendingState = candidateState;
      pendingStateCount = 1;
    }
    var state = lastEngagementState;
    if (pendingStateCount >= HYSTERESIS_COUNT) {
      state = pendingState;
    }

    return {
      state: state,
      score: engScore,
      signals: {
        avgTouch: avgTouch, touchTrend: touchTrend,
        avgScoreDel: avgScoreDel, scoreTrend: scoreTrend,
        avgDeath60: avgDeath60, recentDeaths: recentDeaths,
        avgTaps: avgTaps, hrVolatility: hrVolatility, hrTrend: hrTrend,
        keyVelocity: avgKeyVel, keyRhythm: avgKeyRhythm,
        faceMovement: avgFaceMove, emotion: avgEmotion
      }
    };
  }

  // === POLICY DEFINITIONS ===
  // Each policy returns a map of {category -> delta_fraction} where delta_fraction is
  // applied as: newVal = current + (max - min) * delta_fraction

  var policies = {
    // BORED: speed bumps, more rewards, variety
    bored_speed_up: function () {
      return { speed: 0.14, reward: 0.20, bonus_reward: 0.24, obstacle: -0.06 };
    },
    bored_reward_cluster: function () {
      return { reward: 0.24, bonus_reward: 0.30, speed: 0.10, obstacle: -0.04 };
    },
    bored_variability: function () {
      return { speed: 0.12, gravity: -0.06, reward: 0.16, bonus_reward: 0.20, obstacle: -0.06, visual: 0.10 };
    },
    bored_bonus_burst: function () {
      return { bonus_reward: 0.36, speed: 0.08, reward: 0.12 };
    },

    // FRUSTRATED: ease off, forgive, slow down
    frustrated_ease: function () {
      return { gravity: -0.10, forgiveness: 0.16, speed: -0.10, obstacle: 0.12, visual: 0.08 };
    },
    frustrated_forgive: function () {
      return { forgiveness: 0.20, obstacle: 0.14, gravity: -0.06, speed: -0.06 };
    },
    frustrated_slow: function () {
      return { speed: -0.14, obstacle: 0.10, difficulty: -0.10, gravity: -0.06 };
    },
    frustrated_reward: function () {
      return { bonus_reward: 0.24, reward: 0.16, forgiveness: 0.12 };
    },

    // FLOW: nudges to keep things interesting
    flow_maintain: function () {
      return {};
    },
    flow_nudge: function () {
      return { speed: 0.04, reward: 0.06, bonus_reward: 0.08 };
    },
    flow_spice: function () {
      return { speed: 0.06, bonus_reward: 0.12, visual: 0.06 };
    },

    // EXCITED: ride the wave with boosts
    excited_ride: function () {
      return { speed: 0.08, reward: 0.12, bonus_reward: 0.16 };
    },
    excited_push: function () {
      return { speed: 0.12, difficulty: 0.04, reward: 0.14, bonus_reward: 0.20 };
    },

    // DISENGAGED: dramatic intervention
    disengage_rescue: function () {
      return { reward: 0.28, bonus_reward: 0.40, forgiveness: 0.24, speed: -0.12, obstacle: 0.16, gravity: -0.10 };
    },
    disengage_hook: function () {
      return { reward: 0.32, bonus_reward: 0.44, speed: -0.08, obstacle: 0.14, forgiveness: 0.16 };
    }
  };

  // Map engagement state to candidate policy arms
  var statePolicies = {};
  statePolicies[BORED] = ['bored_speed_up', 'bored_reward_cluster', 'bored_variability', 'bored_bonus_burst'];
  statePolicies[FRUSTRATED] = ['frustrated_ease', 'frustrated_forgive', 'frustrated_slow', 'frustrated_reward'];
  statePolicies[FLOW] = ['flow_maintain', 'flow_nudge', 'flow_spice'];
  statePolicies[EXCITED] = ['excited_ride', 'excited_push'];
  statePolicies[DISENGAGED] = ['disengage_rescue', 'disengage_hook'];

  // === CONTEXTUAL BANDIT (UCB1) ===

  function initArm(name) {
    if (!banditArms[name]) {
      banditArms[name] = { pulls: 0, totalReward: 0, lastReward: 0 };
    }
  }

  function ucb1Select(armNames) {
    var totalPulls = 0;
    for (var i = 0; i < armNames.length; i++) {
      initArm(armNames[i]);
      totalPulls += banditArms[armNames[i]].pulls;
    }
    // Try each arm at least once
    for (var i = 0; i < armNames.length; i++) {
      if (banditArms[armNames[i]].pulls === 0) return armNames[i];
    }
    var best = armNames[0];
    var bestScore = -Infinity;
    for (var i = 0; i < armNames.length; i++) {
      var arm = banditArms[armNames[i]];
      var avgReward = arm.totalReward / arm.pulls;
      var exploration = BANDIT_C * Math.sqrt(Math.log(totalPulls + 1) / arm.pulls);
      var score = avgReward + exploration;
      if (score > bestScore) {
        bestScore = score;
        best = armNames[i];
      }
    }
    return best;
  }

  function banditUpdate(armName, reward) {
    initArm(armName);
    for (var k in banditArms) {
      if (!banditArms.hasOwnProperty(k)) continue;
      banditArms[k].totalReward *= 0.95;
      banditArms[k].pulls = Math.max(1, banditArms[k].pulls * 0.95);
    }
    banditArms[armName].pulls++;
    banditArms[armName].totalReward += reward;
    banditArms[armName].lastReward = reward;
  }

  // === MOD EXECUTOR ===

  var BLOCKED_PATTERNS = ['canvas_', 'bird_width', 'bird_height', 'grid_cell', 'grid_size', '_padding', '_reset_x', '_reset_y', 'apple_initial', 'initial_direction', 'cloud', 'max_clouds', 'max_game_speed', 'max_speed', 'terminal_velocity'];

  function isBlocked(key) {
    for (var i = 0; i < BLOCKED_PATTERNS.length; i++) {
      if (key.indexOf(BLOCKED_PATTERNS[i]) !== -1) return true;
    }
    return false;
  }

  function engagementMods() {
    var mods = global.__gameMods;
    if (!mods || !mods.length) return [];
    var allow = global.__engageModKeys;
    var out = [];
    for (var i = 0; i < mods.length; i++) {
      if (isBlocked(mods[i].key)) continue;
      if (allow && allow.length && allow.indexOf(mods[i].key) === -1) continue;
      out.push(mods[i]);
    }
    return out;
  }

  var directionVetoes = {};
  directionVetoes[FRUSTRATED] =  { 'speed:+': 1, 'difficulty:+': 1, 'gravity:+': 1, 'forgiveness:-': 1, 'obstacle:-': 1 };
  directionVetoes[DISENGAGED] =  { 'speed:+': 1, 'difficulty:+': 1, 'gravity:+': 1, 'forgiveness:-': 1, 'reward:-': 1, 'bonus_reward:-': 1, 'obstacle:-': 1 };
  directionVetoes[BORED] =       { 'speed:-': 1, 'difficulty:-': 1, 'reward:-': 1, 'bonus_reward:-': 1 };
  directionVetoes[FLOW] =        {};
  directionVetoes[EXCITED] =     {};

  function isDeltaVetoed(engState, category, delta) {
    var v = directionVetoes[engState];
    if (!v) return false;
    var dir = delta > 0 ? '+' : '-';
    return !!v[category + ':' + dir];
  }

  function getModsByCategory() {
    var mods = engagementMods();
    if (!mods.length) return {};
    var byCategory = {};
    for (var i = 0; i < mods.length; i++) {
      var cat = mods[i].category || 'other';
      if (!byCategory[cat]) byCategory[cat] = [];
      byCategory[cat].push(mods[i]);
    }
    return byCategory;
  }

  function captureBaselines() {
    var mods = engagementMods();
    if (!mods.length) return;
    for (var i = 0; i < mods.length; i++) {
      if (modBaselines[mods[i].key] == null) {
        try {
          var val = mods[i].get();
          modBaselines[mods[i].key] = (val != null && !isNaN(val)) ? val : mods[i].default;
        } catch (e) {
          modBaselines[mods[i].key] = mods[i].default;
        }
      }
    }
  }

  var MAX_DRIFT_FRAC = 0.6;   // max 60% of range from baseline (room for strong mods)
  var MAX_SINGLE_DELTA = 0.30; // cap any single delta (doubled for stronger effect)

  function driftGuard(mod, current, rawDelta) {
    var range = mod.max - mod.min;
    if (range <= 0) return rawDelta;
    var baseline = modBaselines[mod.key];
    if (baseline == null || isNaN(baseline)) baseline = mod.default;
    var currentDrift = (current - baseline) / range;
    var absDrift = Math.abs(currentDrift);
    if (absDrift >= MAX_DRIFT_FRAC) {
      var sameDirection = (rawDelta > 0 && currentDrift > 0) || (rawDelta < 0 && currentDrift < 0);
      if (sameDirection) return 0;
    }
    if (absDrift > MAX_DRIFT_FRAC * 0.5) {
      var scale = 1 - ((absDrift - MAX_DRIFT_FRAC * 0.5) / (MAX_DRIFT_FRAC * 0.5));
      rawDelta *= Math.max(0.1, scale);
    }
    var capped = Math.min(Math.abs(rawDelta), MAX_SINGLE_DELTA);
    return rawDelta >= 0 ? capped : -capped;
  }

  function applyPolicy(policyName, engState, engScore) {
    var policyFn = policies[policyName];
    if (!policyFn) return [];
    var deltas = policyFn();
    var byCategory = getModsByCategory();
    var applied = [];

    for (var cat in deltas) {
      if (!deltas.hasOwnProperty(cat)) continue;
      var catMods = byCategory[cat];
      if (!catMods || !catMods.length) continue;
      var delta = deltas[cat];

      if (isDeltaVetoed(engState, cat, delta)) continue;

      var urgency = 1.0;
      if (engState === DISENGAGED) urgency = 1.5;
      else if (engState === FRUSTRATED && consecutiveFrustrated > 3) urgency = 1.3;
      else if (engState === BORED && consecutiveBored > 5) urgency = 1.4;
      delta *= urgency;

      for (var i = 0; i < catMods.length; i++) {
        var mod = catMods[i];
        var current;
        try { current = mod.get(); } catch (e) { current = mod.default; }
        if (current == null || isNaN(current)) current = mod.default;

        var range = mod.max - mod.min;
        var modDelta = mod.invert ? -delta : delta;
        modDelta = driftGuard(mod, current, modDelta);
        var newVal = current + range * modDelta;
        newVal = Math.max(mod.min, Math.min(mod.max, newVal));

        newVal = Math.round(newVal / mod.step) * mod.step;
        newVal = Math.max(mod.min, Math.min(mod.max, newVal));

        if (Math.abs(newVal - current) < mod.step) continue;

        try { mod.set(newVal); } catch (e) { continue; }
        applied.push({
          key: mod.key,
          label: mod.label,
          category: cat,
          from: current,
          to: newVal,
          delta: modDelta
        });
        var why = 'UCB1 policy ' + policyName + '. State=' + engState + ' (engagement ' + engScore.toFixed(2) + ').';
        if (global.EngageLogger && global.EngageLogger.logMod) {
          global.EngageLogger.logMod(mod.label, current, newVal, why);
        } else {
          console.log('%cMOD\t' + mod.label + '\t' + current + ' → ' + newVal + '\tWhy: ' + why, 'color:red; font-weight:bold;');
        }
      }
    }
    return applied;
  }

  // === APPLY RAW DELTAS (from predictor) ===

  function applyDeltas(deltas, engState, engScore, source) {
    var byCategory = getModsByCategory();
    var applied = [];
    for (var cat in deltas) {
      if (!deltas.hasOwnProperty(cat)) continue;
      var catMods = byCategory[cat];
      if (!catMods || !catMods.length) continue;
      var delta = deltas[cat];
      if (isDeltaVetoed(engState, cat, delta)) continue;
      var urgency = 1.0;
      if (engState === DISENGAGED) urgency = 1.5;
      else if (engState === FRUSTRATED && consecutiveFrustrated > 3) urgency = 1.3;
      else if (engState === BORED && consecutiveBored > 5) urgency = 1.4;
      delta *= urgency;
      for (var i = 0; i < catMods.length; i++) {
        var mod = catMods[i];
        var current;
        try { current = mod.get(); } catch (e) { current = mod.default; }
        if (current == null || isNaN(current)) current = mod.default;
        var range = mod.max - mod.min;
        var modDelta = mod.invert ? -delta : delta;
        modDelta = driftGuard(mod, current, modDelta);
        var newVal = current + range * modDelta;
        newVal = Math.max(mod.min, Math.min(mod.max, newVal));
        newVal = Math.round(newVal / mod.step) * mod.step;
        newVal = Math.max(mod.min, Math.min(mod.max, newVal));
        if (Math.abs(newVal - current) < mod.step) continue;
        try { mod.set(newVal); } catch (e) { continue; }
        applied.push({ key: mod.key, label: mod.label, category: cat, from: current, to: newVal, delta: modDelta });
        var why = 'Source ' + source + '. State=' + engState + ' (engagement ' + engScore.toFixed(2) + ').';
        if (global.EngageLogger && global.EngageLogger.logMod) {
          global.EngageLogger.logMod(mod.label, current, newVal, why);
        } else {
          console.log('%cMOD\t' + mod.label + '\t' + current + ' → ' + newVal + '\tWhy: ' + why, 'color:red; font-weight:bold;');
        }
      }
    }
    return applied;
  }

  // === REWARD COMPUTATION ===

  function computeReward(prevScore, newScore) {
    return newScore - prevScore;
  }

  // === MAIN DECISION LOOP ===
  var lastPolicyArm = null;

  function onTick(row) {
    tickCount++;
    var vector = row && row.vector ? row.vector : row;
    var gameState = row && row.gameState ? row.gameState : null;
    if (!vector || !Array.isArray(vector)) return;

    history.push({ vector: vector, gameState: gameState });
    if (history.length > HISTORY_WINDOW) history.shift();

    if (tickCount % DECISION_INTERVAL !== 0) return;
    if (tickCount < WARMUP_TICKS) return;

    captureBaselines();

    // 1. Classify engagement
    var classification = classifyEngagement(history);
    var engState = classification.state;
    var engScore = classification.score;

    // Track consecutive states
    if (engState === BORED) { consecutiveBored++; consecutiveFrustrated = 0; }
    else if (engState === FRUSTRATED) { consecutiveFrustrated++; consecutiveBored = 0; }
    else { consecutiveBored = 0; consecutiveFrustrated = 0; }

    if (engScore > sessionPeakScore) sessionPeakScore = engScore;

    // 2. Update bandit from previous decision
    if (lastPolicyArm && tickCount > DECISION_INTERVAL) {
      var reward = computeReward(prevEngagementScore, engScore);
      banditUpdate(lastPolicyArm, reward);
    }
    prevEngagementScore = engScore;
    lastEngagementState = engState;
    lastEngagementScore = engScore;

    // 3. Check if stimulus/predictor has a mod plan (per-mod, Thompson + attention)
    var usedPredictor = false;
    var arm;
    var applied = [];
    var plan = global.__engageModPlan;
    if (plan && plan.length > 0 && global.__gameModsByKey) {
      arm = 'thompson_attention';
      usedPredictor = true;
      var allowKeys = global.__engageModKeys;
      // Apply items 2+ from the plan (item 1 is the stimulus probe); only engagement mods
      for (var p = 1; p < plan.length; p++) {
        var item = plan[p];
        if (allowKeys && allowKeys.length && allowKeys.indexOf(item.modKey) === -1) continue;
        var mod = global.__gameModsByKey[item.modKey];
        if (!mod) continue;
        try { mod.set(item.newValue); } catch (e) { continue; }
        applied.push({
          key: item.modKey,
          label: item.label,
          category: item.category,
          from: item.current,
          to: item.newValue,
          delta: item.direction * 0.07
        });
        var sig = classification.signals || {};
        var why = global.EngageLogger && global.EngageLogger.modWhy
          ? global.EngageLogger.modWhy({
              state: engState,
              engagementScore: engScore,
              touchRatio: sig.avgTouch,
              deaths60: sig.avgDeath60,
              scoreDelta: sig.avgScoreDel,
              thompson: item.thompson,
              attBoost: item.attBoost
            })
          : 'State ' + engState + ' Thompson ' + (item.thompson != null ? item.thompson.toFixed(2) : '');
        if (global.EngageLogger && global.EngageLogger.logMod) {
          global.EngageLogger.logMod(item.label, item.current, item.newValue, why);
        } else {
          console.log('%cMOD\t' + item.label + '\t' + item.current + ' → ' + item.newValue + '\tWhy: ' + why, 'color:red; font-weight:bold;');
        }
      }
    }

    // Fall back to UCB1 policy if stimulus hasn't produced a plan yet
    if (!applied.length) {
      var candidates = statePolicies[engState] || statePolicies[FLOW];
      arm = ucb1Select(candidates);
      if (engagementMods().length) {
        applied = applyPolicy(arm, engState, engScore);
      }
    }
    lastPolicyArm = arm;

    // 5. Emit for external listeners
    var decision = {
      tick: tickCount,
      engagementState: engState,
      engagementScore: engScore,
      signals: classification.signals,
      policy: arm,
      modsApplied: applied,
      banditStats: JSON.parse(JSON.stringify(banditArms)),
      consecutiveBored: consecutiveBored,
      consecutiveFrustrated: consecutiveFrustrated
    };
    global.__engageRLAction = decision;
    try {
      global.dispatchEvent(new CustomEvent('engageRLDecision', { detail: decision }));
    } catch (e) {}

    if (typeof console !== 'undefined' && console.log) {
      console.log('RL\t' + engState + '\t' + engScore.toFixed(3) + '\t' + (usedPredictor ? 'thompson' : 'UCB1') + '\t' + arm + '\t' + applied.length + '\t' + (classification.signals.avgTouch != null ? classification.signals.avgTouch.toFixed(2) : '') + '\t' + (classification.signals.avgDeath60 != null ? classification.signals.avgDeath60.toFixed(1) : '') + '\t' + (classification.signals.scoreTrend != null ? classification.signals.scoreTrend.toFixed(2) : ''));
    }
  }

  // === INIT: attach to tracker ===

  function init() {
    function attach() {
      var tracker = global.engageTracker;
      if (!tracker || typeof tracker._onTick !== 'function') return false;
      var orig = tracker._onTick;
      tracker._onTick = function (row) {
        if (orig) orig(row);
        onTick(row);
      };
      if (typeof console !== 'undefined' && console.log) console.log('RL\tengine attached');
      return true;
    }
    if (!attach()) {
      var check = setInterval(function () {
        if (attach()) clearInterval(check);
      }, 200);
      setTimeout(function () { clearInterval(check); }, 15000);
    }
  }

  if (global.engageTracker) { init(); }
  else if (typeof document !== 'undefined' && document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(init, 600); });
  } else {
    setTimeout(init, 600);
  }

  // Public API
  global.EngageRL = {
    getState: function () { return lastEngagementState; },
    getScore: function () { return lastEngagementScore; },
    getHistory: function () { return history; },
    getBanditStats: function () { return banditArms; },
    getBaselines: function () { return modBaselines; },
    classify: classifyEngagement,
    STATES: { FLOW: FLOW, BORED: BORED, FRUSTRATED: FRUSTRATED, EXCITED: EXCITED, DISENGAGED: DISENGAGED }
  };
})(typeof window !== 'undefined' ? window : globalThis);
