/**
 * Engage Stimulus + Predictor: unified probe-and-learn system.
 *
 * Works from tick 1 with zero data. Key design:
 *
 * 1. THOMPSON SAMPLING with informed priors per (mod, direction):
 *    - Each mod arm has Beta(α, β) distribution. Prior α/β are set by
 *      engagement state heuristics (e.g. frustrated → forgiveness+ has high prior).
 *    - Sample from Beta to pick which mod to apply. Even with 0 data,
 *      priors guide sensible choices instantly.
 *
 * 2. RAPID BAYESIAN UPDATE after each probe:
 *    - Observe reaction over REACTION_WINDOW ticks.
 *    - If positive reaction: α += reward. If negative: β += |penalty|.
 *    - Exponential recency: old observations decay (multiply α,β toward prior)
 *      so the system forgets stale data and adapts fast.
 *
 * 3. ATTENTION REFINEMENT (kicks in after ~10 experiences):
 *    - Cosine similarity between current context and past experience contexts.
 *    - Weights Thompson samples by contextual relevance.
 *    - Finds patterns: "when bored and speed was low, speeding up worked."
 *
 * 4. OUTPUT: window.__engageModPlan = [{modKey, direction, score, newValue}, ...]
 *    The RL engine reads this to apply the top-K changes.
 *
 * All decisions operate on specific mods from __gameMods. Game-agnostic.
 */
(function (global) {
  'use strict';

  // === TUNING ===
  var WARMUP_TICKS = 14;       // no mods for first N ticks (~7s at 500ms tick)
  var PROBE_INTERVAL = 10;     // ticks between probes (~5s at 500ms tick)
  var REACTION_WINDOW = 6;     // ticks to observe after probe (~3s at 500ms tick)
  var DECAY_RATE = 0.99;       // per-tick decay toward prior (was 0.98 — learning persists longer)
  var PRIOR_STRENGTH = 1;      // base prior α+β (was 2 — less opinionated, explores faster)
  var BOOST_STRENGTH = 1.5;    // how much a positive reaction boosts α
  var PENALTY_STRENGTH = 1.0;  // how much a negative reaction boosts β
  var PROBE_MAGNITUDE = 0.16;  // fraction of range to perturb (doubled for stronger probes)
  var TOP_K_PLAN = 1;          // one mod per probe cycle (was 2 — clean attribution)
  var ATTENTION_MIN_EXP = 8;   // min experiences before attention kicks in
  var ATTENTION_WEIGHT = 0.4;  // blend: (1-w)*thompson + w*attention

  // Vector indices (must match engage-tracker FIELDS order)
  var I_TAPS = 6, I_TOUCH_R = 12, I_DSCORE = 8, I_DDEATH = 11, I_DEATH60 = 13, I_DHR = 9;
  var I_KEY_VEL = 14, I_KEY_RHYTHM = 15, I_FACE_MOVE = 16, I_EMOTION = 17;

  // Engagement states (from RL engine)
  var BORED = 'bored', FRUSTRATED = 'frustrated', EXCITED = 'excited',
      FLOW = 'flow', DISENGAGED = 'disengaged';

  // === STATE ===
  var tickCount = 0;
  var history = [];
  var arms = {};          // "modKey:+"|"modKey:-" -> {alpha, beta, priorAlpha, priorBeta}
  var experiences = [];   // [{context, modKey, direction, reactionScore, tick}]
  var pendingProbe = null;
  var lastPlan = null;
  var initialized = false;

  // === INFORMED PRIORS ===
  // Given an engagement state, which mod categories should have high prior for + or - direction?
  var statePriors = {};
  statePriors[BORED] =       { speed: {'+': 1.5, '-': 0.5}, reward: {'+': 1.5, '-': 0.4}, bonus_reward: {'+': 1.6, '-': 0.3}, difficulty: {'+': 1.2, '-': 0.6}, obstacle: {'+': 0.5, '-': 1.0}, gravity: {'+': 0.7, '-': 0.8}, forgiveness: {'+': 0.8, '-': 0.5}, visual: {'+': 1.3, '-': 0.5} };
  statePriors[FRUSTRATED] =  { speed: {'+': 0.4, '-': 1.5}, reward: {'+': 1.2, '-': 0.3}, bonus_reward: {'+': 1.4, '-': 0.3}, difficulty: {'+': 0.3, '-': 1.5}, obstacle: {'+': 1.5, '-': 0.3}, gravity: {'+': 0.4, '-': 1.4}, forgiveness: {'+': 1.5, '-': 0.3}, visual: {'+': 0.8, '-': 0.6} };
  statePriors[EXCITED] =     { speed: {'+': 1.3, '-': 0.5}, reward: {'+': 1.5, '-': 0.4}, bonus_reward: {'+': 1.5, '-': 0.4}, difficulty: {'+': 1.0, '-': 0.6}, obstacle: {'+': 0.6, '-': 0.8}, gravity: {'+': 0.8, '-': 0.7}, forgiveness: {'+': 0.7, '-': 0.6}, visual: {'+': 1.2, '-': 0.5} };
  statePriors[FLOW] =        { speed: {'+': 0.8, '-': 0.8}, reward: {'+': 0.9, '-': 0.7}, bonus_reward: {'+': 1.0, '-': 0.6}, difficulty: {'+': 0.8, '-': 0.8}, obstacle: {'+': 0.8, '-': 0.8}, gravity: {'+': 0.8, '-': 0.8}, forgiveness: {'+': 0.8, '-': 0.7}, visual: {'+': 0.9, '-': 0.7} };
  statePriors[DISENGAGED] =  { speed: {'+': 0.6, '-': 1.0}, reward: {'+': 1.5, '-': 0.3}, bonus_reward: {'+': 1.6, '-': 0.3}, difficulty: {'+': 0.3, '-': 1.5}, obstacle: {'+': 1.5, '-': 0.3}, gravity: {'+': 0.4, '-': 1.5}, forgiveness: {'+': 1.5, '-': 0.3}, visual: {'+': 1.0, '-': 0.5} };

  // Hard direction vetoes: if true the candidate is dropped entirely.
  // Prevents obviously counterproductive changes (e.g. speeding up
  // when frustrated, removing forgiveness when disengaged).
  var directionVetoes = {};
  directionVetoes[FRUSTRATED] =  { 'speed:+': 1, 'difficulty:+': 1, 'gravity:+': 1, 'forgiveness:-': 1, 'obstacle:-': 1 };
  directionVetoes[DISENGAGED] =  { 'speed:+': 1, 'difficulty:+': 1, 'gravity:+': 1, 'forgiveness:-': 1, 'reward:-': 1, 'bonus_reward:-': 1, 'obstacle:-': 1 };
  directionVetoes[BORED] =       { 'speed:-': 1, 'difficulty:-': 1, 'reward:-': 1, 'bonus_reward:-': 1 };
  directionVetoes[FLOW] =        {};
  directionVetoes[EXCITED] =     {};

  function isVetoed(engState, category, direction) {
    var v = directionVetoes[engState];
    if (!v) return false;
    var k = category + ':' + (direction > 0 ? '+' : '-');
    return !!v[k];
  }

  function getPrior(engState, category, direction) {
    var sp = statePriors[engState] || statePriors[FLOW];
    var catP = sp[category] || sp['difficulty'] || { '+': 0.8, '-': 0.8 };
    var dir = direction > 0 ? '+' : '-';
    return catP[dir] || 0.8;
  }

  // === ARM MANAGEMENT ===

  function armKey(modKey, direction) {
    return modKey + ':' + (direction > 0 ? '+' : '-');
  }

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

  function initArms() {
    var mods = engagementMods();
    if (!mods.length) return;
    var engState = getEngState();
    for (var i = 0; i < mods.length; i++) {
      var mod = mods[i];
      for (var d = -1; d <= 1; d += 2) {
        var key = armKey(mod.key, d);
        if (!arms[key]) {
          var prior = getPrior(engState, mod.category, d);
          arms[key] = {
            alpha: prior * PRIOR_STRENGTH,
            beta: (1 - prior * 0.5) * PRIOR_STRENGTH,
            priorAlpha: prior * PRIOR_STRENGTH,
            priorBeta: (1 - prior * 0.5) * PRIOR_STRENGTH
          };
        }
      }
    }
    initialized = true;
  }

  function refreshPriors() {
    var engState = getEngState();
    var mods = engagementMods();
    if (!mods.length) return;
    for (var i = 0; i < mods.length; i++) {
      var mod = mods[i];
      for (var d = -1; d <= 1; d += 2) {
        var key = armKey(mod.key, d);
        if (arms[key]) {
          var prior = getPrior(engState, mod.category, d);
          arms[key].priorAlpha = prior * PRIOR_STRENGTH;
          arms[key].priorBeta = (1 - prior * 0.5) * PRIOR_STRENGTH;
        }
      }
    }
  }

  // === THOMPSON SAMPLING ===

  function sampleBeta(alpha, beta) {
    // Jorgensen's method for Beta sampling using gamma variates
    var a = gammaSample(alpha);
    var b = gammaSample(beta);
    return a / (a + b + 1e-10);
  }

  function gammaSample(shape) {
    // Marsaglia & Tsang's method
    if (shape < 1) {
      return gammaSample(shape + 1) * Math.pow(Math.random(), 1 / shape);
    }
    var d = shape - 1/3;
    var c = 1 / Math.sqrt(9 * d);
    while (true) {
      var x, v;
      do {
        x = randn();
        v = 1 + c * x;
      } while (v <= 0);
      v = v * v * v;
      var u = Math.random();
      if (u < 1 - 0.0331 * x * x * x * x) return d * v;
      if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
    }
  }

  function randn() {
    var u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  // === CONTEXT & SIGNALS ===

  function getEngState() {
    var rl = global.__engageRLAction;
    return rl ? (rl.engagementState || FLOW) : FLOW;
  }

  function getEngScore() {
    var rl = global.__engageRLAction;
    return rl ? (rl.engagementScore || 0.5) : 0.5;
  }

  function mean(arr) {
    if (!arr.length) return 0;
    var s = 0; for (var i = 0; i < arr.length; i++) s += arr[i]; return s / arr.length;
  }

  function extractSignals(rows) {
    var touchR = [], scoreD = [], deathD = [], taps = [], keyVel = [], keyRhy = [], faceM = [], emo = [], hrDel = [];
    for (var i = 0; i < rows.length; i++) {
      var v = rows[i].vector || rows[i];
      if (!v || !v.length) continue;
      touchR.push(v[I_TOUCH_R] || 0);
      scoreD.push(v[I_DSCORE] || 0);
      deathD.push(v[I_DDEATH] || 0);
      taps.push(v[I_TAPS] || 0);
      keyVel.push(v[I_KEY_VEL] || 0);
      keyRhy.push(v[I_KEY_RHYTHM] || 0);
      faceM.push(v[I_FACE_MOVE] || 0);
      emo.push(v[I_EMOTION] || 0);
      hrDel.push(v[I_DHR] || 0);
    }
    return {
      touchR: mean(touchR), scoreD: mean(scoreD), deathD: mean(deathD), taps: mean(taps),
      keyVel: mean(keyVel), keyRhythm: mean(keyRhy), faceMove: mean(faceM), emotion: mean(emo),
      hrDel: mean(hrDel)
    };
  }

  function contextVector() {
    var stateMap = { flow: 0.5, bored: 0.2, frustrated: 0.8, excited: 0.7, disengaged: 0.1 };
    var sig = history.length >= 3 ? extractSignals(history.slice(-5)) : { touchR: 0, scoreD: 0, deathD: 0, taps: 0, keyVel: 0, keyRhythm: 0, faceMove: 0, emotion: 0, hrDel: 0 };
    return [stateMap[getEngState()] || 0.5, getEngScore(), sig.touchR, sig.scoreD, sig.deathD, sig.taps, sig.keyVel, sig.keyRhythm, sig.faceMove, sig.emotion, sig.hrDel];
  }

  // === ATTENTION OVER EXPERIENCES ===

  function dot(a, b) {
    var s = 0, len = Math.min(a.length, b.length);
    for (var i = 0; i < len; i++) s += a[i] * b[i];
    return s;
  }

  function norm(a) {
    var s = 0; for (var i = 0; i < a.length; i++) s += a[i] * a[i];
    return Math.sqrt(s) || 1e-8;
  }

  function attentionBoost(modKey, direction) {
    if (experiences.length < ATTENTION_MIN_EXP) return 0;
    var qVec = contextVector();
    var relevant = [];
    for (var i = 0; i < experiences.length; i++) {
      var e = experiences[i];
      if (e.modKey !== modKey || e.direction !== direction) continue;
      relevant.push(e);
    }
    if (!relevant.length) return 0;

    var totalWeight = 0, weightedScore = 0;
    for (var i = 0; i < relevant.length; i++) {
      var e = relevant[i];
      var sim = dot(qVec, e.contextVec) / (norm(qVec) * norm(e.contextVec));
      var recency = Math.pow(0.95, tickCount - e.tick);
      var w = Math.max(0, sim) * recency;
      totalWeight += w;
      weightedScore += w * e.reactionScore;
    }
    return totalWeight > 0 ? weightedScore / totalWeight : 0;
  }

  // === PLAN: rank all mod arms, pick top-K ===

  function generatePlan() {
    var mods = engagementMods();
    if (!mods.length) return [];

    var engState = getEngState();

    var candidates = [];
    for (var i = 0; i < mods.length; i++) {
      var mod = mods[i];
      for (var d = -1; d <= 1; d += 2) {
        var key = armKey(mod.key, d);
        var arm = arms[key];
        if (!arm) continue;

        if (isVetoed(engState, mod.category, d)) continue;

        // Thompson sample
        var thompson = sampleBeta(arm.alpha, arm.beta);

        // Attention boost (context-weighted average of past outcomes for this arm)
        var attBoost = attentionBoost(mod.key, d);
        var blended = experiences.length >= ATTENTION_MIN_EXP
          ? thompson * (1 - ATTENTION_WEIGHT) + (0.5 + attBoost) * ATTENTION_WEIGHT
          : thompson;

        // Compute target value (flip delta for inverted mods like frame_skip)
        var current;
        try { current = mod.get(); } catch (e) { current = mod.default; }
        if (current == null || isNaN(current)) current = mod.default;
        var range = mod.max - mod.min;
        var effectiveD = mod.invert ? -d : d;
        var delta = effectiveD * PROBE_MAGNITUDE * range;
        var newVal = Math.max(mod.min, Math.min(mod.max, current + delta));
        newVal = Math.round(newVal / mod.step) * mod.step;
        newVal = Math.max(mod.min, Math.min(mod.max, newVal));

        if (Math.abs(newVal - current) < mod.step) continue;

        candidates.push({
          modKey: mod.key,
          label: mod.label,
          category: mod.category,
          direction: d,
          score: blended,
          current: current,
          newValue: newVal,
          thompson: thompson,
          attBoost: attBoost,
          armAlpha: arm.alpha,
          armBeta: arm.beta
        });
      }
    }

    // Sort by blended score descending
    candidates.sort(function (a, b) { return b.score - a.score; });

    // Deduplicate: only one direction per mod
    var seen = {};
    var plan = [];
    for (var i = 0; i < candidates.length && plan.length < TOP_K_PLAN; i++) {
      if (seen[candidates[i].modKey]) continue;
      seen[candidates[i].modKey] = true;
      plan.push(candidates[i]);
    }
    return plan;
  }

  // === PROBE & REACTION ===

  function startProbe(planItem) {
    if (!planItem) return;
    var mod = global.__gameModsByKey && global.__gameModsByKey[planItem.modKey];
    if (!mod) return;
    var cur;
    try { cur = mod.get(); } catch (e) { cur = mod.default; }
    if (cur != null && Math.abs(planItem.newValue - cur) < mod.step) return;

    try { mod.set(planItem.newValue); } catch (e) { return; }
    var baseline = history.length >= REACTION_WINDOW ? extractSignals(history.slice(-REACTION_WINDOW)) : null;

    pendingProbe = {
      tick: tickCount,
      modKey: planItem.modKey,
      category: planItem.category,
      direction: planItem.direction,
      baseline: baseline,
      contextVec: contextVector()
    };

    var rl = global.__engageRLAction;
    var sig = rl && rl.signals ? rl.signals : {};
    var why = global.EngageLogger && global.EngageLogger.modWhy
      ? global.EngageLogger.modWhy({
          state: getEngState(),
          engagementScore: getEngScore(),
          touchRatio: sig.avgTouch,
          deaths60: sig.avgDeath60,
          scoreDelta: sig.avgScoreDel,
          kind: 'probe',
          thompson: planItem.thompson
        })
      : 'Probe. Thompson ' + planItem.thompson.toFixed(2);
    if (global.EngageLogger && global.EngageLogger.logMod) {
      global.EngageLogger.logMod(planItem.label, planItem.current, planItem.newValue, why);
    } else {
      console.log('%cMOD\t' + planItem.label + '\t' + planItem.current + ' → ' + planItem.newValue + '\tWhy: ' + why, 'color:red; font-weight:bold;');
    }
  }

  function measureReaction() {
    if (!pendingProbe) return;
    var after = extractSignals(history.slice(-REACTION_WINDOW));
    var before = pendingProbe.baseline || { touchR: 0, scoreD: 0, deathD: 0, taps: 0, hrDel: 0, faceMove: 0, emotion: 0, keyRhythm: 0 };

    var reactionScore =
      (after.touchR - before.touchR) * 3.0 +
      (after.scoreD - before.scoreD) * 0.5 +
      (after.taps - before.taps) * 0.8 +
      (after.deathD - before.deathD) * -2.0 +
      (after.hrDel - before.hrDel) * -0.5 +
      (after.faceMove - before.faceMove) * 1.5 +
      (after.emotion - before.emotion) * 2.0 +
      (after.keyRhythm - before.keyRhythm) * 1.0;

    // Update Thompson arm
    var key = armKey(pendingProbe.modKey, pendingProbe.direction);
    var arm = arms[key];
    if (arm) {
      if (reactionScore > 0.02) {
        arm.alpha += BOOST_STRENGTH * Math.min(2, reactionScore * 3);
      } else if (reactionScore < -0.02) {
        arm.beta += PENALTY_STRENGTH * Math.min(2, Math.abs(reactionScore) * 3);
      } else {
        arm.alpha += 0.1;
        arm.beta += 0.1;
      }
    }

    experiences.push({
      modKey: pendingProbe.modKey,
      category: pendingProbe.category,
      direction: pendingProbe.direction,
      reactionScore: reactionScore,
      contextVec: pendingProbe.contextVec,
      tick: pendingProbe.tick
    });
    if (experiences.length > 150) experiences.shift();

    if (typeof console !== 'undefined' && console.log) {
      console.log('REACTION\t' + pendingProbe.modKey + '\t' + reactionScore.toFixed(3) + '\t' + (arm ? arm.alpha.toFixed(1) : '') + '\t' + (arm ? arm.beta.toFixed(1) : '') + '\t' + experiences.length);
    }

    pendingProbe = null;
  }

  // === DECAY: keep arms fresh ===

  function decayArms() {
    for (var key in arms) {
      if (!arms.hasOwnProperty(key)) continue;
      var a = arms[key];
      a.alpha = a.priorAlpha + (a.alpha - a.priorAlpha) * DECAY_RATE;
      a.beta = a.priorBeta + (a.beta - a.priorBeta) * DECAY_RATE;
    }
  }

  // === MAIN TICK ===

  function onTick(row) {
    tickCount++;
    history.push(row);
    if (history.length > 40) history.shift();

    if (!initialized) initArms();
    if (!engagementMods().length) return;

    // Decay arms toward prior every tick (keeps learning fresh)
    if (tickCount % 10 === 0) {
      decayArms();
      refreshPriors();
    }

    // Pending probe reaction check
    if (pendingProbe && (tickCount - pendingProbe.tick) >= REACTION_WINDOW) {
      measureReaction();
    }

    // Decision cycle (skip warmup period to collect baseline data)
    if (tickCount % PROBE_INTERVAL === 0 && !pendingProbe && tickCount >= WARMUP_TICKS) {
      var plan = generatePlan();
      lastPlan = plan;
      global.__engageModPlan = plan;

      try {
        global.dispatchEvent(new CustomEvent('engageModPlan', { detail: plan }));
      } catch (e) {}

      // Apply top item as probe (the RL engine applies the rest from __engageModPlan)
      if (plan.length > 0) {
        startProbe(plan[0]);
      }

      if (plan.length > 0 && typeof console !== 'undefined' && console.log) {
        console.log('PLAN\t' + plan.length + '\t' + plan.map(function (p) { return p.modKey + (p.direction > 0 ? '↑' : '↓') + '=' + p.score.toFixed(2); }).join('\t'));
      }
    }
  }

  // === INIT ===

  function init() {
    function attach() {
      var tracker = global.engageTracker;
      if (!tracker || typeof tracker._onTick !== 'function') return false;
      var orig = tracker._onTick;
      tracker._onTick = function (row) {
        if (orig) orig(row);
        onTick(row);
      };
      if (typeof console !== 'undefined' && console.log) console.log('Stimulus\tThompson+Attention attached');
      return true;
    }
    if (!attach()) {
      var check = setInterval(function () {
        if (attach()) clearInterval(check);
      }, 200);
      setTimeout(function () { clearInterval(check); }, 15000);
    }
  }

  if (global.engageTracker) init();
  else if (typeof document !== 'undefined' && document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(init, 400); });
  } else {
    setTimeout(init, 400);
  }

  global.EngageStimulus = {
    getExperiences: function () { return experiences; },
    getArms: function () { return arms; },
    getPlan: function () { return lastPlan; },
    getHistory: function () { return history; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
