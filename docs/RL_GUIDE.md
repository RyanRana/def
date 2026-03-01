# RL and Engagement Tuning Guide

DEF uses **attention-based reinforcement learning** to modify live games and maximize dopamine and engagement. Two complementary systems (Thompson sampling + attention, and a UCB1 bandit) work together; both are game-agnostic and operate on mod categories so the agent can adapt to any web game.

## Overview

```
                        Tick data (18-vector + gameState)
                                    │
                    ┌───────────────┼───────────────┐
                    ▼                               ▼
            Stimulus Layer                    RL Engine
         (Thompson Sampling)              (UCB1 Bandit)
                    │                               │
                    ▼                               ▼
          Per-mod probing              Policy-based bundles
          Learn individual             Learn which bundle
          mod effects                  works per state
                    │                               │
                    └───────────┬───────────────────┘
                                ▼
                    __gameMods[key].set(newValue)
```

## Stimulus Layer: Thompson Sampling + Attention

**File:** `js/engage-stimulus.js`

### How It Works

1. **Arms:** Each (mod, direction) pair is a bandit arm with a Beta(α, β) distribution
2. **Informed priors:** α and β are initialized based on engagement state heuristics (e.g. when frustrated, `forgiveness:+` gets high α)
3. **Probing:** Every `PROBE_INTERVAL` ticks (~5s), sample from all arms, pick the top-scoring candidate, apply the mod change
4. **Reaction:** After `REACTION_WINDOW` ticks (~3s), measure changes in input, scoring, deaths, and face signals
5. **Update:** Positive reaction → increase α (more likely to pick again). Negative → increase β
6. **Decay:** Arms slowly decay toward priors, keeping the system adaptive

### Attention Mechanism

After `ATTENTION_MIN_EXP` experiences (~8), the system starts using contextual attention:
- Each experience stores a context vector (engagement state, score, signals)
- When evaluating an arm, compute cosine similarity between current context and past contexts
- Weight past experiences by similarity × recency
- Blend: `(1 - ATTENTION_WEIGHT) * thompson + ATTENTION_WEIGHT * (0.5 + attentionBoost)`

This means the system learns patterns like "when bored and speed is low, speeding up works" without explicit rules.

### Direction Vetoes

Hard safety blocks prevent obviously wrong changes:

| State | Blocked Directions |
|-------|-------------------|
| Frustrated | speed↑, difficulty↑, gravity↑, forgiveness↓, obstacle↓ |
| Disengaged | speed↑, difficulty↑, gravity↑, forgiveness↓, reward↓, obstacle↓ |
| Bored | speed↓, difficulty↓, reward↓ |
| Flow | none |
| Excited | none |

### Tuning Parameters

| Parameter | Default | Effect |
|-----------|---------|--------|
| `WARMUP_TICKS` | 14 | No mods for first N ticks (baseline collection) |
| `PROBE_INTERVAL` | 10 | Ticks between probe cycles |
| `REACTION_WINDOW` | 6 | Ticks to observe after probe |
| `PROBE_MAGNITUDE` | 0.16 | Fraction of mod range to perturb |
| `DECAY_RATE` | 0.99 | Per-tick decay toward prior (lower = faster forgetting) |
| `PRIOR_STRENGTH` | 1 | Base α+β (lower = explores faster) |
| `BOOST_STRENGTH` | 1.5 | Reward for positive reaction |
| `PENALTY_STRENGTH` | 1.0 | Penalty for negative reaction |
| `TOP_K_PLAN` | 1 | Mods per probe cycle (keep at 1 for clean attribution) |
| `ATTENTION_MIN_EXP` | 8 | Experiences before attention kicks in |
| `ATTENTION_WEIGHT` | 0.4 | Blend weight for attention vs pure Thompson |

## RL Engine: UCB1 Bandit + Policies

**File:** `js/engage-rl.js`

### How It Works

1. **Classify engagement** from rolling signal windows (last 20 ticks)
2. **Select policy** via UCB1 from the candidate set for that state
3. **Apply policy** — each policy returns category deltas (e.g. `{speed: +0.14, reward: +0.20}`)
4. **Observe reward** — change in engagement score since last decision
5. **Update UCB1** — increase pull count and total reward for the selected arm

### Policy Library

**Bored policies:**
- `bored_speed_up` — speed↑, reward↑, obstacle↓
- `bored_reward_cluster` — reward↑↑, speed↑, obstacle↓
- `bored_variability` — speed↑, gravity↓, reward↑, visual↑
- `bored_bonus_burst` — bonus_reward↑↑, speed↑

**Frustrated policies:**
- `frustrated_ease` — gravity↓, forgiveness↑, speed↓, obstacle↑
- `frustrated_forgive` — forgiveness↑↑, obstacle↑, gravity↓
- `frustrated_slow` — speed↓↓, obstacle↑, difficulty↓
- `frustrated_reward` — bonus_reward↑, reward↑, forgiveness↑

**Flow policies:**
- `flow_maintain` — no changes (protect the good state)
- `flow_nudge` — tiny speed↑, reward↑
- `flow_spice` — small speed↑, bonus_reward↑

**Excited policies:**
- `excited_ride` — speed↑, reward↑, bonus_reward↑
- `excited_push` — speed↑↑, difficulty↑, reward↑

**Disengaged policies:**
- `disengage_rescue` — reward↑↑, bonus_reward↑↑, forgiveness↑, speed↓, obstacle↑, gravity↓
- `disengage_hook` — reward↑↑, bonus_reward↑↑, speed↓, obstacle↑

### Urgency Scaling

Consecutive frustrated/bored states amplify adjustments:
- Disengaged: 1.5x urgency (always)
- Frustrated > 3 consecutive: 1.3x
- Bored > 5 consecutive: 1.4x

### Drift Guard

Prevents mods from drifting too far from baseline:
- `MAX_DRIFT_FRAC = 0.6` — max 60% of mod range from baseline
- If already drifted > 30%, scale down further same-direction changes
- If at max drift, block same-direction changes entirely

### UCB1 Parameters

| Parameter | Default | Effect |
|-----------|---------|--------|
| `WARMUP_TICKS` | 12 | No decisions for first N ticks |
| `DECISION_INTERVAL` | 6 | Ticks between decisions |
| `HISTORY_WINDOW` | 20 | Rolling window for signals |
| `BANDIT_C` | 1.4 | UCB1 confidence (higher = more exploration) |
| `EXPLORE_RATE` | 0.15 | Exploration vs exploitation balance |

### Engagement Score Computation

The raw engagement score is computed from:
```
score = 0.5
  + avgTouch * 0.3 (capped 0.2)
  + avgScoreDel * 0.02 (capped 0.15)
  - avgDeath60 * 0.06 (capped 0.3)
  + touchTrend * 0.5 (capped 0.1)
  + scoreTrend * 0.03 (capped 0.1)
  - recentDeaths * 0.12 (capped 0.12)
  + avgFaceMove * 0.5 (capped 0.08)
  + avgEmotion * 0.1 (capped 0.08)
  + avgKeyRhythm * 0.1 (capped 0.05)
  + avgKeyVel * 0.04 (capped 0.06)
  + hrTrend * -0.03 (capped 0.05)
```

Then smoothed with EMA (α=0.45): `smoothed = 0.45 * raw + 0.55 * previous`

## Python Q-Learning Trainer

**File:** `scripts/engage_rl.py`

An optional offline trainer that learns Q-values from session data:

### State Space (20 dimensions)
- 14 normalized vector fields (HR, BR, expression, session, score, deaths, taps, touch, deltas, rates)
- 6 game-agnostic features (obstacle density, is_playing, paused, crashed, progress, started)

### Actions (4)
- `noop` — no change
- `increase_hook` — increase engagement hooks (rewards, speed)
- `decrease_friction` — decrease friction (forgiveness, ease obstacles)
- `inject_variability` — add variety (mix of changes)

### Reward Function
```
r_t = 1.0 + λ * (1 - p_quit)
```
Where `p_quit = sigmoid(0.5 + 2.0 * deathRate60s - 1.5 * touchRatio - 0.5 * hrDelta)` and `λ = 10.0`.

### Usage

```bash
# Demo: simulate on captured session data (data/)
python scripts/engage_rl.py demo

# Train on CSV export
python scripts/engage_rl.py train

# Export weights for JS runtime
python scripts/engage_rl.py export
```

Exports weights to `js/engage-rl-weights.json`. The JS runtime can optionally load these weights, but the Thompson + UCB1 system works well without offline training.

## Tuning Recommendations

### More Aggressive Adaptation
- Decrease `PROBE_INTERVAL` (faster probing)
- Increase `PROBE_MAGNITUDE` (larger changes)
- Increase `BOOST_STRENGTH` / `PENALTY_STRENGTH` (faster learning)
- Decrease `DECAY_RATE` (less memory)

### More Conservative Adaptation
- Increase `WARMUP_TICKS` (longer baseline)
- Decrease `PROBE_MAGNITUDE` (smaller changes)
- Decrease `MAX_DRIFT_FRAC` (less total change allowed)
- Increase `HYSTERESIS_COUNT` (slower state transitions)

### Better Exploration
- Increase `BANDIT_C` (more UCB1 exploration)
- Decrease `PRIOR_STRENGTH` (less opinionated priors)
- Increase `ATTENTION_MIN_EXP` (wait longer before using context)

### Per-Game Tuning
Edit `engagement_mod_keys` in `scripts/game_profiles/<game>.json` to control which mods the engine can touch. Fewer keys = more focused adaptation. Add blocklist patterns in `engage-stimulus.js` and `engage-rl.js` to prevent specific mods from ever being modified.
