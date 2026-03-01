#!/usr/bin/env python3
"""
Unified Gemini game analyzer: for each game HTML, produces a full game profile:
  1. game_profiles/<game>.json  — state fields + mod injectors (obstacles, rewards, speed, gravity, etc.)
  2. games/game_state_<game>.js — window.getEngageGameState() for time-series capture
  3. games/game_mods_<game>.js  — window.__gameMods registry with get/set/range for RL to call

Run: GEMINI_API_KEY=your_key python analyze_games.py
"""
import json, os, re, sys

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

try:
    import google.generativeai as genai
except ImportError:
    genai = None

API_KEY = os.environ.get('GEMINI_API_KEY', '')
ROOT = os.path.dirname(os.path.abspath(__file__))
GAMES_DIR = os.path.join(ROOT, 'games')
PROFILES_DIR = os.path.join(ROOT, 'scripts', 'game_profiles')


def extract_js(path):
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    scripts = re.findall(r'<script[^>]*>(.*?)</script>', content, re.DOTALL)
    js = '\n'.join(scripts).strip()
    if len(js) > 50000:
        js = js[:25000] + '\n/* ...truncated... */\n' + js[-25000:]
    return js if js else content[:50000]


PROMPT = """You are an expert JavaScript game reverse-engineer. Given a browser game's source code, produce a COMPLETE JSON object with three top-level keys: "state", "mods", and "engagement_mod_keys".

Game: {game_name} (file: {game_file})

--- CODE START ---
{js_code}
--- CODE END ---

## "state" (array): every field worth capturing at 1 Hz for engagement analytics
Include ALL of these that exist in the game:
- Player position (x, y), velocity (vx, vy), direction
- Score, high score, lives, health
- Game phase: playing/paused/dead/menu
- Obstacle/entity count, nearest obstacle distance
- Level or difficulty progression
- Any danger/proximity metric

Each state field:
{{ "key": "snake_case_name", "description": "short", "js_expression": "exact JS to read value in game scope", "type": "number"|"boolean" }}

## "mods" (array): every NON-PLAYER parameter that could be changed (for manual tweaks and for engagement)
Include ALL that apply: game speed, gravity, jump, obstacle spawn/frequency/gap, reward values, difficulty scaling, forgiveness, canvas size, grid size, visual options, etc. Both gameplay and presentation.

Each mod field:
{{ "key": "snake_case_name", "label": "Human Label", "description": "what it does", "js_get": "exact JS expression to READ current value", "js_set": "exact JS statement using VALUE to WRITE (use VALUE as placeholder)", "default": <number>, "min": <number>, "max": <number>, "step": <number>, "category": "speed"|"gravity"|"obstacle"|"reward"|"enemy"|"difficulty"|"forgiveness" }}

## "engagement_mod_keys" (array of strings): YOU decide which mods are good for automatic engagement tuning
This is a SUBSET of the "key" values from "mods". Include ONLY mods that directly change how the game PLAYS (the challenge, pacing, rewards) — not how it LOOKS.

INCLUDE (these are gameplay levers):
- Game speed, tick rate, or frame skip
- Gravity strength
- Jump velocity, jump height, or lift force
- Obstacle spawn rate, frequency, gap between obstacles
- Reward/score multipliers, points per collectible, growth per apple
- Forgiveness: game-over cooldown, respawn timer, invincibility frames
- Difficulty acceleration / progression rate
- Maximum game speed / speed caps

NEVER INCLUDE (these are appearance/layout — they hurt game flow when auto-changed):
- canvas_width, canvas_height, or any canvas dimension
- grid_cell_size, grid_size, cell_size, tile_size
- bird_width, bird_height, player_width, player_height, sprite dimensions
- Any X/Y position: initial position, reset position, spawn position (e.g. snake_reset_x, apple_initial_x)
- Visual padding, margin, color, opacity, background
- Initial direction (e.g. snake starting direction)
- Cloud count, cloud frequency, or any purely cosmetic parameter
- Score display coefficient (how score is rendered, not how it's earned)

Rules:
1. Every string in engagement_mod_keys MUST exactly match a "key" from "mods"
2. Target 4–6 keys per game (never more than 8)
3. If in doubt whether a mod is gameplay vs appearance, EXCLUDE it
4. Test: "If an AI changed this by 20% mid-game, would a player feel the game plays differently, or just looks different?" Only include if the answer is "plays differently."

CRITICAL RULES:
- js_get and js_set must be valid JavaScript that works in the game's window scope
- js_set must use the literal word VALUE as the placeholder for the new value
- Include at minimum 6–10 mod fields per game; then set engagement_mod_keys to the 4–8 that are best for auto-engagement
- For variables inside closures that aren't accessible, skip them — only include what's reachable from window scope
- Output ONLY the JSON object, no markdown fences, no explanation

Example output structure:
{{
  "state": [
    {{ "key": "player_x", "description": "Player X position", "js_expression": "player.x", "type": "number" }},
    ...
  ],
  "mods": [
    {{ "key": "game_speed", "label": "Game Speed", "description": "How fast the game runs", "js_get": "gameSpeed", "js_set": "gameSpeed = VALUE", "default": 1, "min": 0.5, "max": 3, "step": 0.1, "category": "speed" }},
    {{ "key": "obstacle_gap", "label": "Obstacle Gap", "description": "Gap between obstacles", "js_get": "config.gapCoeff", "js_set": "config.gapCoeff = VALUE", "default": 0.6, "min": 0.2, "max": 1.5, "step": 0.1, "category": "obstacle" }},
    ...
  ],
  "engagement_mod_keys": ["game_speed", "obstacle_gap", "reward_value"]
}}"""


def analyze_game(js_code, game_name, game_file):
    if not genai or not API_KEY:
        return None
    genai.configure(api_key=API_KEY)
    model = genai.GenerativeModel('gemini-2.5-flash')
    prompt = PROMPT.format(game_name=game_name, game_file=game_file, js_code=js_code)
    response = model.generate_content(prompt)
    text = response.text.strip()
    text = re.sub(r'^```(?:json)?\s*', '', text)
    text = re.sub(r'\s*```\s*$', '', text)
    try:
        return json.loads(text.strip())
    except Exception as e:
        print(f"  Parse error: {e}")
        print(f"  Raw (first 600): {text[:600]}")
        return None


def generate_game_state_js(profile, game_name):
    """Generate games/game_state_<game>.js from profile.state"""
    state_fields = profile.get('state', [])
    lines = [
        f'// Game state capture for {game_name} — auto-generated from game_profiles/{game_name}.json',
        '(function () {',
        "  'use strict';",
        '  function read() {',
        '    var s = {};',
    ]
    for f in state_fields:
        key, expr = f.get('key', ''), f.get('js_expression', '')
        if not key or not expr:
            continue
        lines.append(f'    try {{ s["{key}"] = {expr}; }} catch(e) {{ s["{key}"] = null; }}')
    lines += [
        '    return s;',
        '  }',
        '  if (typeof window !== "undefined") window.getEngageGameState = read;',
        '})();',
    ]
    path = os.path.join(GAMES_DIR, f'game_state_{game_name}.js')
    with open(path, 'w') as f:
        f.write('\n'.join(lines) + '\n')
    print(f'  Wrote {path} ({len(state_fields)} state fields)')


def generate_game_mods_js(profile, game_name):
    """Generate games/game_mods_<game>.js — registry of mod injectors the RL can call."""
    mods = profile.get('mods', [])
    lines = []
    lines.append(f'// Game mod injectors for {game_name} — auto-generated from game_profiles/{game_name}.json')
    lines.append('// window.__gameMods = array of { key, label, category, default, min, max, step, get(), set(v) }')
    lines.append('(function () {')
    lines.append("  'use strict';")
    lines.append('  var mods = [')

    for idx, m in enumerate(mods):
        key = m.get('key', '')
        if not key:
            continue
        js_get = m.get('js_get', 'null')
        js_set = m.get('js_set', '')
        default_val = m.get('default', 1)
        lines.append('    {')
        lines.append(f'      key: "{key}",')
        lines.append(f'      label: {json.dumps(m.get("label", key))},')
        lines.append(f'      category: "{m.get("category", "other")}",')
        lines.append(f'      "default": {default_val},')
        lines.append(f'      min: {m.get("min", 0)},')
        lines.append(f'      max: {m.get("max", 10)},')
        lines.append(f'      step: {m.get("step", 0.1)},')
        lines.append(f'      get: function() {{ try {{ return {js_get}; }} catch(e) {{ return {default_val}; }} }},')
        if m.get('invert'):
            lines.append(f'      set: function(VALUE) {{ try {{ {js_set}; }} catch(e) {{}} }},')
            lines.append('      invert: true')
        else:
            lines.append(f'      set: function(VALUE) {{ try {{ {js_set}; }} catch(e) {{}} }}')
        comma = ',' if idx < len(mods) - 1 else ''
        lines.append(f'    }}{comma}')

    lines.append('  ];')
    lines.append('  window.__gameMods = mods;')
    lines.append('  window.__gameModsByKey = {};')
    lines.append('  for (var i = 0; i < mods.length; i++) window.__gameModsByKey[mods[i].key] = mods[i];')
    allow = profile.get('engagement_mod_keys', [])
    if allow:
        keys_js = json.dumps(allow)
        lines.append(f'  window.__engageModKeys = {keys_js};')
    lines.append(f"  console.log('[GameMods] Registered ' + mods.length + ' mod injectors for {game_name}');")
    lines.append('})();')

    path = os.path.join(GAMES_DIR, f'game_mods_{game_name}.js')
    with open(path, 'w') as fp:
        fp.write('\n'.join(lines) + '\n')
    print(f'  Wrote {path} ({len(mods)} mod injectors)')


def main():
    if not API_KEY:
        print("Set GEMINI_API_KEY env var or .env")
        return 1
    if not genai:
        print("pip install google-generativeai")
        return 1

    os.makedirs(PROFILES_DIR, exist_ok=True)
    os.makedirs(GAMES_DIR, exist_ok=True)

    games = [('snake', 'snake.html'), ('bird', 'bird.html'), ('dino', 'dino.html')]
    for game_name, html_name in games:
        path = os.path.join(GAMES_DIR, html_name)
        if not os.path.exists(path):
            print(f'Skip {path} (not found)')
            continue
        print(f'\n=== {game_name} ===')
        js = extract_js(path)
        if not js:
            print('  No JS found')
            continue
        profile = analyze_game(js, game_name, html_name)
        if not profile:
            print('  Gemini returned no profile')
            continue
        profile_path = os.path.join(PROFILES_DIR, f'{game_name}.json')
        with open(profile_path, 'w') as f:
            json.dump(profile, f, indent=2)
        print(f'  Profile: {profile_path}')
        print(f'  State fields: {len(profile.get("state", []))}')
        print(f'  Mod injectors: {len(profile.get("mods", []))}')
        generate_game_state_js(profile, game_name)
        generate_game_mods_js(profile, game_name)
    print('\nDone. Profiles in scripts/game_profiles/, JS in games/.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
