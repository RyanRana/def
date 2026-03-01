# Session Data

Session data **captured across all 60 game runs** (10 DEF-on + 10 DEF-off per game: snake, bird, dino). Each file is one complete session with **1 Hz tick data**: every tick has a **full 18-dimensional vector** matching the engage-tracker format, plus gameState, engagement, and optional mods. Session lengths and vector variation give enough data for benchmarks and analysis.

## Structure

```
data/
├── snake/
│   ├── def_on_01.json ... def_on_10.json    # DEF enabled
│   └── def_off_01.json ... def_off_10.json   # DEF disabled (baseline)
├── bird/
│   ├── def_on_01.json ... def_on_10.json
│   └── def_off_01.json ... def_off_10.json
└── dino/
    ├── def_on_01.json ... def_on_10.json
    └── def_off_01.json ... def_off_10.json
```

## File Format

Each tick includes a **full 18-d vector**; the top-level `vector_fields` array documents the field order.

```json
{
  "game": "snake",
  "def_enabled": true,
  "session_id": "snake_def_on_01",
  "duration_sec": 245,
  "final_score": 38,
  "deaths": 3,
  "vector_fields": ["heartRate", "breathingRate", "expressionIdx", "sessionTimeSec", "score", "deaths", "tapCount", "activeTouchMs", "scoreDelta", "hrDelta", "brDelta", "deathsDelta", "touchRatio", "deathRate60s", "keyVelocity", "keyRhythm", "faceMovement", "emotionValence"],
  "ticks": [
    {
      "vector": [72.4, 15.2, 1, 0, 0, 0, 2, 320, 0, 0, 0, 0, 0.32, 0, 2.1, 0.62, 0.04, 0.08],
      "gameState": { "snake_x": 160, "snake_y": 80, ... },
      "engagement": { "state": "flow", "score": 0.68 },
      "mods_applied": []
    }
  ],
  "summary": {
    "avg_engagement": 0.68,
    "flow_pct": 62,
    "frustration_pct": 12,
    "avg_score_delta": 0.15,
    "tick_count": 245
  }
}
```

## Vector Fields (18)

| Index | Field | Description |
|-------|-------|-------------|
| 0 | heartRate | BPM from webcam rPPG (0 if unavailable) |
| 1 | breathingRate | RPM from webcam rPPG |
| 2 | expressionIdx | 0=none 1=neutral 2=happy 3=sad 4=angry 5=fear 6=calm |
| 3 | sessionTimeSec | Seconds since session start |
| 4 | score | Current game score |
| 5 | deaths | Total death count |
| 6 | tapCount | Key/touch events in last tick |
| 7 | activeTouchMs | Milliseconds of active input in last tick |
| 8 | scoreDelta | Score change since previous tick |
| 9 | hrDelta | Heart rate change since previous tick |
| 10 | brDelta | Breathing rate change since previous tick |
| 11 | deathsDelta | Deaths in last tick (0 or 1) |
| 12 | touchRatio | activeTouchMs / 1000 (0–1) |
| 13 | deathRate60s | Deaths in rolling 60-second window |
| 14 | keyVelocity | Keys per second |
| 15 | keyRhythm | Input regularity (0=erratic, 1=steady) |
| 16 | faceMovement | Face region pixel change (0–1) |
| 17 | emotionValence | Emotion estimate (−1 to 1) |

## Game State Fields

**Snake:** `snake_x`, `snake_y`, `snake_velocity_x`, `snake_velocity_y`, `snake_body_length`, `apples_eaten`, `apple_x`, `apple_y`

**Bird:** `player_y_percent`, `player_x_percent`, `pipe_pair_count`

**Dino:** `distance_ran`, `current_speed`, `is_crashed`, `is_paused`, `is_game_active`, `trex_y_pos`, `trex_is_jumping`, `obstacle_count`, `nearest_obstacle_x`, `game_running_time`

## Collecting More Data

To capture new session data, run the server with `?logToServer=1` on any game URL. The server can log tick rows to stdout. Use `engage-tracker.js`'s `exportCSV()` or `downloadCSV()` methods in the browser console to export a session.
