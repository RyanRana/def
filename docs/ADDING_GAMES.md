# Adding a Game

This guide walks through adding a new HTML5 game to DEF. The engagement pipeline is game-agnostic — you only need to teach it how to read your game's state and what parameters it can modify.

## Prerequisites

- An HTML5 game that runs in a single page
- The game exposes score and death/failure state (via globals, DOM, or any JS-accessible mechanism)
- The game has tunable parameters (speed, difficulty, rewards, etc.)

## Step 1: Add the Game HTML

Place your game file at `games/<name>.html`. The server will automatically inject the bootstrap script.

## Step 2: Create the Game State Script

Create `games/game_state_<name>.js` that defines `window.getEngageGameState()`:

```javascript
// games/game_state_mygame.js
(function() {
  window.getEngageGameState = function() {
    return {
      // Include fields that change over time and are useful for time-series analysis.
      // Use keys that describe what the value represents.
      player_x: myGame.player.x,
      player_y: myGame.player.y,
      speed: myGame.currentSpeed,
      level: myGame.level,
      is_alive: !myGame.gameOver,
      enemy_count: myGame.enemies.length,
    };
  };
})();
```

**Tips:**
- Return a flat object (no nested objects)
- Include position, speed, game state flags, obstacle info
- Values should be numeric or boolean
- This function is called every tick (1 Hz), so keep it fast

## Step 3: Create the Game Mods Script

Create `games/game_mods_<name>.js` that defines the mod registry:

```javascript
// games/game_mods_mygame.js
(function() {
  window.__gameMods = [
    {
      key: 'game_speed',
      label: 'Game Speed',
      category: 'speed',
      default: 1.0,
      min: 0.3,
      max: 3.0,
      step: 0.1,
      get: function() { return myGame.speed; },
      set: function(v) { myGame.speed = v; }
    },
    {
      key: 'enemy_spawn_rate',
      label: 'Enemy Spawn Rate',
      category: 'obstacle',
      default: 2.0,
      min: 0.5,
      max: 5.0,
      step: 0.5,
      invert: true,  // lower value = easier = engine decreases when frustrated
      get: function() { return myGame.spawnRate; },
      set: function(v) { myGame.spawnRate = v; }
    },
    {
      key: 'score_multiplier',
      label: 'Score Multiplier',
      category: 'reward',
      default: 1.0,
      min: 1.0,
      max: 5.0,
      step: 0.5,
      get: function() { return myGame.scoreMultiplier; },
      set: function(v) { myGame.scoreMultiplier = v; }
    },
    {
      key: 'extra_lives',
      label: 'Extra Lives',
      category: 'forgiveness',
      default: 0,
      min: 0,
      max: 3,
      step: 1,
      get: function() { return myGame.extraLives; },
      set: function(v) { myGame.extraLives = v; }
    }
  ];

  // Build keyed lookup for stimulus/RL
  window.__gameModsByKey = {};
  for (var i = 0; i < window.__gameMods.length; i++) {
    window.__gameModsByKey[window.__gameMods[i].key] = window.__gameMods[i];
  }

  // Allowlist: only these mods are used by the engagement engine.
  // Others remain available in the manual overlay.
  window.__engageModKeys = [
    'game_speed',
    'enemy_spawn_rate',
    'score_multiplier',
    'extra_lives'
  ];
})();
```

### Mod Properties

| Property | Required | Description |
|----------|----------|-------------|
| `key` | yes | Unique string identifier |
| `label` | yes | Human-readable name |
| `category` | yes | One of: `speed`, `gravity`, `obstacle`, `reward`, `bonus_reward`, `difficulty`, `forgiveness`, `visual`, `player_ability` |
| `default` | yes | Default value |
| `min` | yes | Minimum allowed value |
| `max` | yes | Maximum allowed value |
| `step` | yes | Smallest change increment |
| `get` | yes | Function returning current value |
| `set` | yes | Function accepting new value |
| `invert` | no | If true, engine decreases value for "increase" effects |

### Category Guide

| Category | When increased | When decreased |
|----------|---------------|----------------|
| `speed` | Game goes faster | Game slows down |
| `gravity` | Stronger gravity / harder jumps | Weaker gravity / easier jumps |
| `obstacle` | More gaps / easier obstacles | Denser obstacles |
| `reward` | More rewards / points | Fewer rewards |
| `forgiveness` | More chances / safety nets | Less forgiving |
| `difficulty` | Harder overall | Easier overall |

## Step 4: Add Score/Death Adapter

In `js/engage-adapter.js`, add a branch for your game:

```javascript
// In the detection logic:
if (location.pathname.indexOf('mygame') !== -1) {
  window.__engageGetScore = function() {
    return myGame.score || 0;
  };
  window.__engageGetDeaths = function() {
    return myGame.deaths || 0;
  };
}
```

## Step 5: Register in Server

In `server.js`, extend the game HTML regex to include your game:

```javascript
// Change:
const GAME_HTML = /^\/games\/(snake|bird|dino)\.html$/i;
// To:
const GAME_HTML = /^\/games\/(snake|bird|dino|mygame)\.html$/i;
```

## Step 6: Add Landing Page Link (optional)

Add a link in `index.html`:

```html
<a href="/games/mygame.html">My Game</a>
```

## Using Gemini Auto-Generation

Instead of writing state and mod scripts by hand, you can use `analyze_games.py`:

1. Place your game HTML at `games/<name>.html`
2. Run: `GEMINI_API_KEY=your_key python analyze_games.py`
3. This generates:
   - `scripts/game_profiles/<name>.json` — state + mod definitions
   - `games/game_state_<name>.js` — state capture script
   - `games/game_mods_<name>.js` — mod registry script
4. Review and edit the generated files as needed
5. Set `engagement_mod_keys` in the profile JSON to control which mods the engine uses

## Choosing Good Mods

**Do include:**
- Speed / game pace
- Gravity / jump physics
- Obstacle spacing / frequency
- Reward size / frequency
- Forgiveness mechanics (extra lives, respawn advantages)

**Don't include (blocklisted):**
- Canvas/viewport size
- Sprite dimensions
- Max speed caps (causes instability)
- Initial positions (one-time values)

**The `invert` flag:** Use this when a higher value means "harder" but the category semantics expect "increase = easier". Example: `frame_skip` where lower = faster gameplay — set `invert: true` so the engine decreases it when it wants to speed up.

## Testing

1. Start the server: `npm run serve`
2. Open `http://localhost:8765/games/mygame.html`
3. The engagement panel should appear at the bottom
4. Check the browser console for `RL engine attached` and `Stimulus Thompson+Attention attached`
5. Play for ~15 seconds to see engagement classification begin
6. Check the Mods tab in the panel to see active mod values
