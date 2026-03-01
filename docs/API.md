# API Reference

## Server Endpoints

### `GET /games/<name>.html`

Serves game HTML with the engagement bootstrap script injected before `</body>`. Supported games: `snake`, `bird`, `dino`.

Query parameters:
- `logToServer=1` — enable POSTing tick data to `/log`

### `POST /log`

Receives tick data or mod events from the client.

**Tick data:**
```json
{
  "vector": [72.5, 15.2, 1, 45, 12, 2, 3, 350, 1, 0.5, -0.3, 0, 0.35, 1, 2.5, 0.72, 0.04, 0.15],
  "gameState": { "snake_x": 160, "snake_y": 80, ... }
}
```

**Mod event:**
```json
{
  "type": "mod",
  "message": "[MOD] Game Speed: 6.00 → 7.20 (policy=bored_speed_up, state=bored)"
}
```

Response: `204 No Content`

### `GET /logs/stream`

Server-Sent Events (SSE) stream of all log events. Replays the last 200 lines on connect.

```
Content-Type: text/event-stream

data: "72.50\t15.20\t1\t45\t12\t..."
data: "[MOD] Game Speed: 6.00 → 7.20"
```

### `GET /`

Serves `index.html` (landing page).

### `GET /*`

Serves static files from the project root. MIME types: `.html`, `.js`, `.css`, `.json`, `.ico`, `.png`.

---

## Game profiles API (states, mods)

These endpoints serve the game profile data from `scripts/game_profiles/<game>.json`. Use them for tooling, `analyze_games`, or any client that needs the state/mod schema for a game.

### `GET /api/games`

Returns the list of supported games.

**Response:** `200 OK`

```json
{
  "games": ["snake", "bird", "dino"]
}
```

### `GET /api/games/<name>`

Returns the full profile for a game: `state` (state field definitions), `mods` (mod definitions), and `engagement_mod_keys` (allowlist for the RL engine).

**Response:** `200 OK` — full profile object (same shape as the JSON file).

```json
{
  "state": [
    { "key": "snake_x", "description": "...", "js_expression": "snake.x", "type": "number" },
    ...
  ],
  "mods": [
    { "key": "game_frame_skip", "label": "Game Frame Skip", "category": "speed", "default": 3, "min": 1, "max": 10, ... },
    ...
  ],
  "engagement_mod_keys": ["game_frame_skip", "bonus_apple_count", ...]
}
```

**Response:** `404` — `{ "error": "Game not found", "game": "<name>" }` if `<name>` is not `snake`, `bird`, or `dino`.

### `GET /api/games/<name>/state`

Returns only the state field definitions for the game (keys, descriptions, `js_expression`, type). Same as the `state` array in the full profile.

**Response:** `200 OK` — array of state field objects.

### `GET /api/games/<name>/mods`

Returns only the mod definitions for the game. Same as the `mods` array in the full profile.

**Response:** `200 OK` — array of mod objects.

### `GET /api/games/<name>/engagement_mod_keys`

Returns only the engagement mod allowlist (mod keys the RL engine is allowed to adjust).

**Response:** `200 OK` — array of strings (mod keys).

The profile JSON files are the same ones used by `analyze_games.py` to generate `game_state_*.js` and `game_mods_*.js`; the API exposes them over HTTP so external tools can discover state and mod schemas without reading the repo.

---

## Vector Format

The engage-tracker produces an 18-field numeric vector each tick (1 Hz):

| Index | Field | Type | Range | Description |
|-------|-------|------|-------|-------------|
| 0 | heartRate | float | 0–200 | BPM from webcam rPPG (0 if camera off) |
| 1 | breathingRate | float | 0–40 | RPM from webcam rPPG (0 if camera off) |
| 2 | expressionIdx | int | 0–6 | 0=none 1=neutral 2=happy 3=sad 4=angry 5=fear 6=calm |
| 3 | sessionTimeSec | int | 0+ | Seconds since tracker start |
| 4 | score | int | 0+ | Raw game score |
| 5 | deaths | int | 0+ | Total death count |
| 6 | tapCount | int | 0+ | Key/touch events in last tick window |
| 7 | activeTouchMs | int | 0–1000 | Milliseconds of active input in last tick |
| 8 | scoreDelta | int | any | Score change since previous tick |
| 9 | hrDelta | float | any | Heart rate change since previous tick |
| 10 | brDelta | float | any | Breathing rate change since previous tick |
| 11 | deathsDelta | int | 0–1 | Deaths in last tick |
| 12 | touchRatio | float | 0–1 | activeTouchMs / 1000 |
| 13 | deathRate60s | int | 0+ | Deaths in rolling 60-second window |
| 14 | keyVelocity | float | 0+ | Keys per second in tick window |
| 15 | keyRhythm | float | 0–1 | Input regularity (0=erratic, 1=steady) |
| 16 | faceMovement | float | 0–1 | Face region pixel change (arousal proxy) |
| 17 | emotionValence | float | -1–1 | Emotion estimate (neg=stressed, pos=happy) |

## Game State Format

Each tick also includes a `gameState` object from `window.getEngageGameState()`:

### Snake
```json
{
  "snake_x": 160,
  "snake_y": 80,
  "snake_velocity_x": 16,
  "snake_velocity_y": 0,
  "snake_body_length": 7,
  "apples_eaten": 3,
  "apple_x": 256,
  "apple_y": 192
}
```

### Bird
```json
{
  "player_y_percent": 45.2,
  "player_x_percent": 20.0,
  "pipe_pair_count": 2
}
```

### Dino
```json
{
  "distance_ran": 1523.4,
  "current_speed": 8.5,
  "is_crashed": false,
  "is_paused": false,
  "is_game_active": true,
  "trex_y_pos": 93.0,
  "trex_is_jumping": false,
  "obstacle_count": 2,
  "nearest_obstacle_x": 340.5,
  "game_running_time": 45000
}
```

## Mod Format

Each entry in `window.__gameMods`:

```json
{
  "key": "game_frame_skip",
  "label": "Game Frame Skip",
  "description": "Number of animation frames to skip...",
  "default": 4,
  "min": 1,
  "max": 8,
  "step": 1,
  "category": "speed",
  "invert": true,
  "get": "function() { ... }",
  "set": "function(v) { ... }"
}
```

**Categories:** `speed`, `gravity`, `obstacle`, `reward`, `bonus_reward`, `difficulty`, `forgiveness`, `visual`, `player_ability`

**`invert` flag:** When true, the engine decreases this value to achieve a "speed up" effect (e.g. frame skip: lower = faster).

## Engagement State Output

The RL engine emits a `engageRLDecision` CustomEvent and sets `window.__engageRLAction`:

```json
{
  "tick": 42,
  "engagementState": "flow",
  "engagementScore": 0.68,
  "signals": {
    "avgTouch": 0.35,
    "touchTrend": 0.02,
    "avgScoreDel": 1.5,
    "scoreTrend": 0.1,
    "avgDeath60": 0.5,
    "recentDeaths": 0,
    "avgTaps": 3.2,
    "hrVolatility": 0.4,
    "hrTrend": -0.1,
    "keyVelocity": 2.5,
    "keyRhythm": 0.72,
    "faceMovement": 0.04,
    "emotion": 0.15
  },
  "policy": "flow_maintain",
  "modsApplied": [
    {
      "key": "game_frame_skip",
      "label": "Game Frame Skip",
      "category": "speed",
      "from": 4,
      "to": 3,
      "delta": -0.14
    }
  ],
  "banditStats": { ... },
  "consecutiveBored": 0,
  "consecutiveFrustrated": 0
}
```

## Stimulus Plan Output

The stimulus layer sets `window.__engageModPlan` and emits `engageModPlan`:

```json
[
  {
    "modKey": "game_frame_skip",
    "label": "Game Frame Skip",
    "category": "speed",
    "direction": -1,
    "score": 0.72,
    "current": 4,
    "newValue": 3,
    "thompson": 0.68,
    "attBoost": 0.04,
    "armAlpha": 2.1,
    "armBeta": 0.8
  }
]
```

## Session Data Format

See `data/README.md` for the format of saved session files.

## Client-Side API

### EngageTracker
- `engageTracker.getTimeSeries()` — all tick rows
- `engageTracker.getLastVector()` — latest 18-field vector
- `engageTracker.getLastRow()` — latest `{vector, gameState}`
- `engageTracker.exportCSV()` — CSV string of all vectors
- `engageTracker.downloadCSV(filename)` — trigger CSV download

### EngageRL
- `EngageRL.getState()` — current engagement state string
- `EngageRL.getScore()` — current engagement score (0–1)
- `EngageRL.getHistory()` — rolling history window
- `EngageRL.getBanditStats()` — UCB1 arm statistics
- `EngageRL.getBaselines()` — mod baseline values

### EngageStimulus
- `EngageStimulus.getExperiences()` — all probe/reaction experiences
- `EngageStimulus.getArms()` — Thompson arm statistics (alpha, beta per arm)
- `EngageStimulus.getPlan()` — latest mod plan
- `EngageStimulus.getHistory()` — stimulus tick history
