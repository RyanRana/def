# DEF — Dynamic Engagement Framework

DEF is a **dynamic engagement framework** that adapts to any web game. It injects a thin layer on top of game pages—games are never edited—and uses **attention-based reinforcement learning** to modify live games in real time (speed, rewards, difficulty, forgiveness) to **maximize dopamine and engagement**. Vitals (heart rate, breathing rate) come from in-browser webcam processing (rPPG); no video leaves the browser.

https://www.youtube.com/watch?v=ITA7dEJnZSg

## Results

Data captured across all 60 game runs (10 DEF-on + 10 DEF-off per game; see `data/`):

| Game | DEF On Engagement | DEF Off | Flow On | Flow Off | Frust On | Frust Off | Session +% | Score +% |
|------|-------------------|---------|---------|----------|----------|-----------|------------|----------|
| Snake | 0.68 | 0.49 | 62% | 41% | 12% | 24% | +38% | +22% |
| Bird | 0.61 | 0.45 | 54% | 38% | 18% | 28% | +31% | +19% |
| Dino | 0.64 | 0.47 | 58% | 40% | 14% | 26% | +29% | +25% |

With the agent on, sessions show higher engagement, more time in flow, less frustration, and longer play—the agent is modifying live game parameters to maximize that “one more run” feeling.

## Quick Start

```bash
npm install
npm run serve
```

- **Landing:** http://localhost:8765
- **Games:** http://localhost:8765/games/snake.html · bird.html · dino.html
- **With server logging:** append `?logToServer=1` to any game URL

Camera is optional. The agent’s engagement panel appears at the bottom of each game page.

### Python tools (optional)

```bash
pip install -r requirements.txt
python scripts/engage_rl.py demo        # run Q-learning demo on captured session data
```

## Architecture

DEF is a **dynamic engagement framework** that can attach to any web game. The pipeline runs in the browser; the server only injects a small loader.

```
Browser                                      Server (Node.js)
┌──────────────────────────────────┐        ┌──────────────┐
│ game HTML (any web game)         │        │ server.js    │
│   ↓ injected by server           │        │  - static    │
│ engage-bootstrap.js              │        │  - inject    │
│   ↓ loads chain:                 │        │  - POST /log │
│ game_state → game_mods → adapter │        │  - SSE stream│
│   → camera-consent               │        └──────────────┘
│   ↓ after consent:               │
│ tracker (1Hz vector)             │──POST /log──→
│ inference-vitals (webcam rPPG)   │
│ logger → UI (bottom panel)       │
│ stimulus (Thompson + attention)  │
│ attention-based RL (UCB1)       │
│   ↓ modifies live game via       │
│     __gameMods → max engagement  │
└──────────────────────────────────┘
```

1. User opens a game URL. The server injects `engage-bootstrap.js` before `</body>`.
2. Bootstrap loads: game state → game mods → adapter → camera consent.
3. After consent: tracker → inference → logger → UI → stimulus → RL.
4. **Tracker** ticks at 1 Hz: reads vitals, score, deaths, input; builds an 18-field vector and game-specific state.
5. **Stimulus** (Thompson sampling + attention) probes mod changes and learns what works.
6. **Attention-based RL** classifies engagement, selects policies via UCB1, and applies mod adjustments through `__gameMods` to modify the live game and maximize dopamine and engagement.

## Project Structure

```
presage/
├── server.js              # HTTP server; injects bootstrap; POST /log, GET /logs/stream
├── index.html             # Landing page
├── js/                    # Engagement pipeline (served directly by server)
│   ├── engage-bootstrap.js   # Injected first; loads the chain
│   ├── engage-adapter.js     # Per-game score/death readers
│   ├── camera-consent.js     # Camera permission modal
│   ├── engage-tracker.js     # 1 Hz tick, 18-field vector
│   ├── inference-vitals.js   # Webcam HR/BR via rPPG
│   ├── engage-logger.js      # Tick logging, mod "why" text
│   ├── engage-tracker-ui.js  # Bottom panel UI
│   ├── engage-stimulus.js    # Thompson sampling + attention
│   ├── engage-rl.js          # UCB1 bandit, engagement states, mod executor
│   └── mod-overlay.js        # Manual mod sliders
├── games/                 # Game pages and per-game scripts
│   ├── snake.html, bird.html, dino.html
│   ├── game_state_*.js    # window.getEngageGameState()
│   ├── game_mods_*.js     # window.__gameMods registry
│   └── mod_*.js           # Manual mod definitions
├── scripts/
│   ├── build-www.js              # Build static site to www/
│   ├── engage_rl.py              # Python Q-learning trainer
│   └── game_profiles/            # JSON game profiles (state + mods)
├── data/                  # Session data captured across 60 runs
│   ├── snake/, bird/, dino/
│   └── README.md
├── docs/                  # Technical documentation
│   ├── ARCHITECTURE.md
│   ├── API.md
│   ├── ADDING_GAMES.md
│   └── RL_GUIDE.md
└── analyze_games.py       # Gemini: game HTML → profiles + JS
```

## How the Agent Maximizes Engagement

The agent tracks player state at 1 Hz and classifies it into five engagement states:

| State | Signals | Response |
|-------|---------|----------|
| **Flow** | Steady input, moderate scoring, stable vitals | Maintain — small nudges only |
| **Bored** | Low input, flat score, declining taps | Speed up, cluster rewards, add variability |
| **Frustrated** | High death rate, recent deaths, declining engagement | Ease obstacles, slow down, increase forgiveness |
| **Excited** | High scoring, fast input, HR volatility | Ride the wave, slight speed boost |
| **Disengaged** | Low input + high deaths — about to quit | Dramatic rescue: big rewards, ease everything |

The agent uses **attention-based reinforcement learning** with two complementary parts:
- **Thompson Sampling + attention** (stimulus layer): probes individual mod changes, re-weights by context (ΔHR, deaths, input, session), observes reaction, and builds a Bayesian model of what works.
- **UCB1 Bandit** (RL engine): selects between policy bundles, balancing exploration and exploitation, and applies mod changes to the **live game** to maximize dopamine and engagement.

Both only modify mods in the game’s `engagement_mod_keys` allowlist and respect blocklists (no canvas size, no max-speed caps).

## Adding a Game

See [docs/ADDING_GAMES.md](docs/ADDING_GAMES.md) for the full guide. Summary:

1. Add `games/<name>.html`
2. Add a branch in `engage-adapter.js` for score/death reading
3. Create `game_state_<name>.js` with `window.getEngageGameState()`
4. Create `game_mods_<name>.js` with `window.__gameMods` and `window.__engageModKeys`
5. Extend the game regex in `server.js`
6. Add a link on `index.html`

Or use `analyze_games.py` with a Gemini API key to auto-generate profiles:
```bash
GEMINI_API_KEY=your_key python analyze_games.py
```

## RL and Training

See [docs/RL_GUIDE.md](docs/RL_GUIDE.md) for details on the attention-based RL (Thompson sampling, attention weighting, UCB1 bandit) and the Python Q-learning trainer.

The agent is **game-agnostic**: it reads whatever mods exist in `__gameMods` and applies adjustments by category to modify the live game and maximize engagement. Adding a new web game requires only a game profile—no agent code changes.

## API Reference

See [docs/API.md](docs/API.md) for full endpoint and data format documentation.

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/games/<name>.html` | GET | Serve game with bootstrap injected |
| `/log` | POST | Receive tick data or mod events |
| `/logs/stream` | GET | SSE stream of all log events |

## Environment

- **Node.js** — required for server
- **Python 3 + numpy** — optional, for `analyze_games.py` and `scripts/engage_rl.py`
- **.env** — optional: `PORT=8765`, `GEMINI_API_KEY=...`

## License

Vital estimates are for general wellness only, not medical use. Game content and third-party libraries have their own terms.
