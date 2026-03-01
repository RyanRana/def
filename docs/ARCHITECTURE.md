# Architecture

## Overview

DEF (Dynamic Engagement Framework) is a **lightweight agent framework** that adapts to any web game. Using **attention-based reinforcement learning**, it **modifies live games** in real time to **maximize dopamine and engagement**. A Node.js server injects a thin client-side pipeline; the game’s own HTML and JS are never edited.

**Key constraints:**
- Games are never edited — the agent is injected by the server and attaches on top
- Vitals come from in-browser webcam inference (rPPG) — no video leaves the browser
- The agent is game-agnostic — it operates on mod categories (speed, gravity, reward, etc.) and can attach to any web game with a profile

## System Flow

```
                    ┌─────────────────────────────────────────────┐
                    │              Browser                        │
                    │                                             │
                    │  ┌──────────────────────┐                   │
                    │  │ Game HTML             │                   │
                    │  │ (snake/bird/dino)     │                   │
                    │  └────────┬─────────────┘                   │
                    │           │ server injects before </body>   │
                    │  ┌────────▼─────────────┐                   │
                    │  │ engage-bootstrap.js   │                   │
                    │  └────────┬─────────────┘                   │
                    │           │ sequential load chain           │
                    │  ┌────────▼─────────────┐                   │
                    │  │ game_state_<game>.js  │ → getEngageGameState()
                    │  │ game_mods_<game>.js   │ → __gameMods + __engageModKeys
                    │  │ engage-adapter.js     │ → __engageGetScore/Deaths
                    │  │ camera-consent.js     │ → permission modal
                    │  └────────┬─────────────┘                   │
                    │           │ after consent                   │
                    │  ┌────────▼─────────────┐                   │
                    │  │ engage-tracker.js     │ 1 Hz tick loop   │
                    │  │   ↓ builds 18-vector  │                   │
                    │  │ inference-vitals.js   │ webcam HR/BR     │
                    │  │ engage-logger.js      │ logging          │
                    │  │ engage-tracker-ui.js  │ bottom panel     │
                    │  │ engage-stimulus.js    │ Thompson probes  │
                    │  │ engage-rl.js          │ UCB1 + policies  │
                    │  └──────────────────────┘                   │
                    │           │                                  │
                    │           │ __gameMods[key].set(newValue)    │
                    │           ▼                                  │
                    │  Game params modified in real time           │
                    └─────────────────┬───────────────────────────┘
                                      │ POST /log (optional)
                              ┌───────▼───────┐
                              │  server.js    │
                              │  - static     │
                              │  - inject     │
                              │  - /log       │
                              │  - /logs/stream│
                              └───────────────┘
```

## Components

### Server (`server.js`)

- Serves static files from project root (`js/`, `games/`, `index.html`)
- Intercepts game HTML requests matching `/games/(snake|bird|dino).html`
- Injects `<script src="/js/engage-bootstrap.js"></script>` before `</body>`
- `POST /log` — receives tick data and mod events, prints to stdout, broadcasts via SSE
- `GET /logs/stream` — Server-Sent Events stream of all log lines (with 200-line history)

### Bootstrap (`js/engage-bootstrap.js`)

Entry point injected by the server. Loads the pipeline in order:
1. `game_state_<game>.js` — registers `window.getEngageGameState()`
2. `game_mods_<game>.js` — registers `window.__gameMods` array and `window.__engageModKeys`
3. `engage-adapter.js` — sets `window.__engageGetScore` and `window.__engageGetDeaths`
4. `camera-consent.js` — shows camera permission modal, then loads remaining scripts

### Tracker (`js/engage-tracker.js`)

1 Hz tick loop that builds the 18-field time-series vector:

```
[heartRate, breathingRate, expressionIdx, sessionTimeSec, score, deaths,
 tapCount, activeTouchMs, scoreDelta, hrDelta, brDelta, deathsDelta,
 touchRatio, deathRate60s, keyVelocity, keyRhythm, faceMovement, emotionValence]
```

Also captures `gameState` from `window.getEngageGameState()` each tick. Tracks input via keyboard (desktop) or touch (mobile).

### Inference (`js/inference-vitals.js`)

Webcam-based vital signs from in-browser processing:
- **Heart rate** — rPPG via VitalLens or OpenCV + bandpass FFT
- **Breathing rate** — extracted from the same webcam signal
- **Face signals** — `faceMovement` (pixel delta, arousal proxy) and `emotionValence` (-1 to +1)

Sets `window.__inferenceVitals` for the tracker to read.

### Stimulus (`js/engage-stimulus.js`)

Thompson Sampling + Attention system for learning which mod changes work:

1. **Informed priors** — Beta(α, β) distributions per (mod, direction) arm, initialized from engagement state heuristics
2. **Probing** — every `PROBE_INTERVAL` ticks, samples from Beta distributions, picks top-K mod changes
3. **Reaction measurement** — after `REACTION_WINDOW` ticks, measures change in input/scoring/deaths
4. **Bayesian update** — positive reactions boost α, negative boost β
5. **Attention refinement** — after enough experiences, uses cosine similarity over context vectors to weight Thompson samples by contextual relevance
6. **Direction vetoes** — hard blocks on obviously wrong changes (e.g. speeding up when frustrated)

Outputs `window.__engageModPlan` for the RL engine.

### RL Engine (`js/engage-rl.js`)

Engagement state detector + UCB1 contextual bandit:

1. **Classify engagement** from rolling signal windows:
   - FLOW: steady input, moderate scoring, stable vitals
   - BORED: low input, flat score, declining taps
   - FRUSTRATED: high death rate, recent deaths
   - EXCITED: high scoring, fast input, HR volatility
   - DISENGAGED: low input + high deaths
2. **Hysteresis** — requires N consecutive classifications before switching state
3. **UCB1 policy selection** — each state has 2–4 candidate policies (e.g. `bored_speed_up`, `bored_reward_cluster`); UCB1 balances exploration vs exploitation
4. **Mod application** — policies output category deltas; scaled by urgency; applied through `__gameMods[key].set()`
5. **If stimulus has a plan** — uses that instead of UCB1 fallback

### Game State (`games/game_state_*.js`)

Per-game `window.getEngageGameState()` providing game-specific fields each tick:

- **Snake (8):** snake_x, snake_y, snake_velocity_x, snake_velocity_y, snake_body_length, apples_eaten, apple_x, apple_y
- **Bird (3):** player_y_percent, player_x_percent, pipe_pair_count
- **Dino (10):** distance_ran, current_speed, is_crashed, is_paused, is_game_active, trex_y_pos, trex_is_jumping, obstacle_count, nearest_obstacle_x, game_running_time

### Game Mods (`games/game_mods_*.js`)

Per-game mod registry. Each mod has: `key`, `label`, `category`, `default`, `min`, `max`, `step`, `get()`, `set()`, and optional `invert` flag.

Categories: `speed`, `gravity`, `obstacle`, `reward`, `difficulty`, `forgiveness`, `visual`

**Engagement allowlist** (`__engageModKeys`): only listed mods are used by stimulus/RL. Blocklists in stimulus and RL further restrict (no canvas, no max_speed, no terminal_velocity).

### Game Profiles (`scripts/game_profiles/*.json`)

JSON files defining state fields, mods, and engagement_mod_keys per game. Used by `analyze_games.py` to generate `game_state_*.js` and `game_mods_*.js`. Can be hand-edited.

## Data Flow Per Tick

```
1. Timer fires (1 Hz)
2. Tracker reads:
   - __inferenceVitals → HR, BR, expression, face signals
   - __engageGetScore() → score
   - __engageGetDeaths() → deaths
   - Input state → taps, touch time, key velocity, key rhythm
3. Tracker computes deltas (scoreDelta, hrDelta, etc.)
4. Tracker builds 18-field vector + gameState
5. Tracker pushes to timeSeries, calls onTick callbacks
6. Stimulus receives tick:
   - Decays arms, refreshes priors
   - If pending probe completed → measure reaction → Bayesian update
   - If probe cycle → generate plan → apply probe → set __engageModPlan
7. RL engine receives tick:
   - Adds to history window
   - Every DECISION_INTERVAL ticks:
     - Classify engagement state
     - Update bandit from previous decision
     - If stimulus has plan → apply remaining items
     - Else → UCB1 select policy → apply policy mods
     - Emit decision event
8. Logger formats and optionally POSTs to /log
9. UI updates bottom panel
```

## Configuration

### Server
- `PORT` — server port (default: 8765, set in `.env`)
- `HOST` — bind address (default: 0.0.0.0)

### RL Engine Constants
- `WARMUP_TICKS` — ticks before first decision (default: 12)
- `DECISION_INTERVAL` — ticks between decisions (default: 6)
- `HISTORY_WINDOW` — rolling window size (default: 20)
- `BANDIT_C` — UCB1 exploration parameter (default: 1.4)
- `MAX_DRIFT_FRAC` — max drift from baseline (default: 0.6)

### Stimulus Constants
- `PROBE_INTERVAL` — ticks between probes (default: 10)
- `REACTION_WINDOW` — ticks to observe reaction (default: 6)
- `PROBE_MAGNITUDE` — fraction of range to perturb (default: 0.16)
- `DECAY_RATE` — arm decay toward prior (default: 0.99)
- `ATTENTION_MIN_EXP` — experiences before attention kicks in (default: 8)
