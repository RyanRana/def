#!/usr/bin/env python3
"""
Engage RL: Maximize expected session time via Q-learning.
- State s_t: 14-vector (normalized) + game-agnostic features from gameState → ~20 dims.
- Actions: noop, increase_hook, decrease_friction, inject_variability.
- Reward r_t = Δt + λ(1 - p_quit), p_quit from logistic on deathRate60s, touchRatio, hrDelta, etc.
- Q(s,a) = r + γ max_a' Q(s',a'); update with α. Export weights for JS runtime.

Usage:
  python scripts/engage_rl.py train   # train on CSV (optional, needs data)
  python scripts/engage_rl.py demo    # simulate on captured session data in data/, print Q and actions
  python scripts/engage_rl.py export  # write weights to js/engage-rl-weights.json
"""
import json
import math
import os
import sys

import numpy as np

# --- Constants (match JS) ---
LAMBDA = 10.0  # reward weight for quit prevention
GAMMA = 0.95
ALPHA = 0.1
N_ACTIONS = 4  # noop, increase_hook, decrease_friction, inject_variability
STATE_DIM = 20  # 14 normalized vector + 6 game-agnostic
ACTION_NAMES = ["noop", "increase_hook", "decrease_friction", "inject_variability"]

# Vector indices (from engage-tracker FIELDS)
I_HR, I_BR, I_EXPR, I_SESS, I_SCORE, I_DEATHS = 0, 1, 2, 3, 4, 5
I_TAPS, I_TOUCH_MS, I_DSCORE, I_DHR, I_DBR, I_DDEATH, I_TOUCH_R, I_DEATH60 = 6, 7, 8, 9, 10, 11, 12, 13


def normalize_vector(v):
    """Normalize 14-vector to [0,1] or bounded. Returns 14-dim np array."""
    v = np.array(v, dtype=float).ravel()
    if len(v) < 14:
        v = np.resize(v, 14)
    v = v[:14]
    out = np.zeros(14)
    out[0] = min(1.0, v[0] / 120.0)   # hr
    out[1] = min(1.0, v[1] / 30.0)   # br
    out[2] = min(1.0, v[2] / 6.0)    # expr
    out[3] = min(1.0, v[3] / 600.0)  # sess
    out[4] = min(1.0, v[4] / 100.0)  # score
    out[5] = min(1.0, v[5] / 20.0)   # deaths
    out[6] = min(1.0, v[6] / 20.0)   # tapCount
    out[7] = min(1.0, v[7] / 1000.0) # activeTouchMs
    out[8] = np.clip((v[8] + 5) / 10.0, 0, 1)   # scoreDelta
    out[9] = np.clip((v[9] + 30) / 60.0, 0, 1)  # hrDelta
    out[10] = np.clip((v[10] + 15) / 30.0, 0, 1)
    out[11] = min(1.0, v[11])
    out[12] = min(1.0, max(0, v[12]))  # touchRatio
    out[13] = min(1.0, v[13] / 10.0)   # deathRate60s
    return out


def game_state_to_features(gs):
    """Map any gameState dict to 6 game-agnostic features [0,1]."""
    if not gs or not isinstance(gs, dict):
        return np.zeros(6)
    # obstacle_density, is_playing, is_paused, is_game_over, progress, momentum_like
    obstacle = 0.0
    if "obstacle_count" in gs and gs["obstacle_count"] is not None:
        obstacle = min(1.0, float(gs["obstacle_count"]) / 5.0)
    elif "pipe_count" in gs and gs["pipe_count"] is not None:
        obstacle = min(1.0, float(gs["pipe_count"]) / 10.0)
    crashed = 1.0 if gs.get("crashed") or gs.get("lost") else 0.0
    paused = 1.0 if gs.get("paused") else 0.0
    started = 1.0 if gs.get("started") else (0.0 if crashed else 0.5)
    is_playing = 1.0 - crashed if not paused else 0.0
    progress = 0.0
    if "distance_ran" in gs and gs["distance_ran"] is not None:
        progress = min(1.0, float(gs["distance_ran"]) / 1000.0)
    elif "score" in gs and gs["score"] is not None:
        progress = min(1.0, float(gs["score"]) / 50.0)
    elif "length" in gs and gs["length"] is not None:
        progress = min(1.0, float(gs["length"]) / 20.0)
    return np.array([obstacle, is_playing, paused, crashed, progress, started])


def build_state(vector, game_state):
    """Full state s_t: 20 dims (14 normalized vector + 6 game features)."""
    v = normalize_vector(vector)
    g = game_state_to_features(game_state)
    return np.concatenate([v, g]).astype(np.float32)


def sigmoid(x):
    return 1.0 / (1.0 + math.exp(-x))


def p_quit(state):
    """Logistic p_quit: high deathRate60s, low touchRatio, negative hrDelta -> high quit."""
    # state indices: 13=deathRate60s, 12=touchRatio, 9=hrDelta; game 0-5
    death60 = state[13] if len(state) > 13 else 0
    touch_r = state[12] if len(state) > 12 else 0
    hr_d = state[9] if len(state) > 9 else 0.5
    # logit: +death60, -touchRatio, + (if hr_d low then stress)
    logit = 0.5 + 2.0 * death60 - 1.5 * touch_r - 0.5 * hr_d
    return sigmoid(logit)


def reward(state, action):
    """r_t = Δt + λ(1 - p_quit). Δt=1 per tick."""
    pq = p_quit(state)
    return 1.0 + LAMBDA * (1.0 - pq)


def q_linear(state, weights, bias):
    """Q(s, a) for all a: weights shape (N_ACTIONS, STATE_DIM), bias (N_ACTIONS,)."""
    s = np.array(state).ravel()[:STATE_DIM]
    if len(s) < STATE_DIM:
        s = np.pad(s, (0, STATE_DIM - len(s)))
    return np.dot(weights, s) + bias


def select_action(state, weights, bias, epsilon=0.1):
    """Argmax Q(s,a) with optional epsilon-greedy."""
    q = q_linear(state, weights, bias)
    if np.random.random() < epsilon:
        return int(np.random.randint(0, N_ACTIONS))
    return int(np.argmax(q))


def update_q(weights, bias, s, a, r, s_next):
    """Q(s,a) += α [ r + γ max_a' Q(s',a') - Q(s,a) ]."""
    q_sa = q_linear(s, weights, bias)[a]
    q_next = np.max(q_linear(s_next, weights, bias))
    td = r + GAMMA * q_next - q_sa
    s = np.array(s).ravel()[:STATE_DIM]
    if len(s) < STATE_DIM:
        s = np.pad(s, (0, STATE_DIM - len(s)))
    weights[a] += ALPHA * td * s
    bias[a] += ALPHA * td


def train_on_rows(rows, weights, bias, n_epochs=2):
    """rows = list of {vector, gameState}. Update Q weights in place."""
    for _ in range(n_epochs):
        for i in range(len(rows) - 1):
            r = rows[i]
            rn = rows[i + 1]
            vec = r.get("vector", r) if isinstance(r, dict) else r
            gs = r.get("gameState") if isinstance(r, dict) else None
            vec_next = rn.get("vector", rn) if isinstance(rn, dict) else rn
            gs_next = rn.get("gameState") if isinstance(rn, dict) else None
            s = build_state(vec, gs)
            s_next = build_state(vec_next, gs_next)
            a = select_action(s, weights, bias, epsilon=0.2)
            rw = reward(s, a)
            update_q(weights, bias, s, a, rw, s_next)
    return weights, bias


def demo():
    """Simulate on sample time-series rows; print Q and chosen actions."""
    np.random.seed(42)
    weights = np.random.randn(N_ACTIONS, STATE_DIM) * 0.1
    bias = np.zeros(N_ACTIONS)
    # Sample rows: vector 14-dim, gameState dict
    sample_rows = []
    for t in range(30):
        vec = [
            72 + np.random.randn() * 5, 15 + np.random.randn() * 2, 1, t,
            10 + t * 2, 0, 2, 300, 1.5, 0, 0, 0, 0.3, 0
        ]
        gs = {"distance_ran": t * 50, "speed": 6, "crashed": False, "obstacle_count": 1, "started": True}
        sample_rows.append({"vector": vec, "gameState": gs})
    train_on_rows(sample_rows, weights, bias, n_epochs=3)
    print("Demo: Q-learning on 30 sample ticks")
    print("Actions: 0=noop 1=increase_hook 2=decrease_friction 3=inject_variability")
    for i, row in enumerate(sample_rows[:15]):
        s = build_state(row["vector"], row["gameState"])
        pq = p_quit(s)
        rw = reward(s, 0)
        q_all = q_linear(s, weights, bias)
        a = np.argmax(q_all)
        print(f"  t={i:2d} p_quit={pq:.3f} r={rw:.2f} Q=[{q_all[0]:.2f},{q_all[1]:.2f},{q_all[2]:.2f},{q_all[3]:.2f}] a={a} ({ACTION_NAMES[a]})")
    return weights, bias


def export_weights(weights, bias, path):
    """Write weights and p_quit coeffs for JS."""
    out = {
        "weights": weights.tolist(),
        "bias": bias.tolist(),
        "lambda": LAMBDA,
        "gamma": GAMMA,
        "alpha": ALPHA,
        "stateDim": STATE_DIM,
        "nActions": N_ACTIONS,
        "actionNames": ACTION_NAMES,
        "p_quit_coeffs": {"death60": 2.0, "touchRatio": -1.5, "hrDelta": -0.5, "intercept": 0.5},
    }
    with open(path, "w") as f:
        json.dump(out, f, indent=2)
    print(f"Exported to {path}")


def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    root = os.path.dirname(script_dir)
    out_path = os.path.join(root, "js", "engage-rl-weights.json")
    if len(sys.argv) > 1 and sys.argv[1] == "train":
        # Optional: load CSV and train
        csv_path = os.path.join(root, "engage-timeseries.csv")
        if not os.path.exists(csv_path):
            print("No CSV found; run demo and export.")
            weights, bias = demo()
        else:
            import csv
            rows = []
            with open(csv_path) as f:
                r = csv.DictReader(f)
                for row in r:
                    vec = [float(row.get(f, 0)) for f in (
                        "heartRate","breathingRate","expressionIdx","sessionTimeSec","score","deaths",
                        "tapCount","activeTouchMs","scoreDelta","hrDelta","brDelta","deathsDelta","touchRatio","deathRate60s")]
                    rows.append({"vector": vec, "gameState": {}})
            weights = np.random.randn(N_ACTIONS, STATE_DIM) * 0.1
            bias = np.zeros(N_ACTIONS)
            train_on_rows(rows, weights, bias, n_epochs=5)
        export_weights(weights, bias, out_path)
    elif len(sys.argv) > 1 and sys.argv[1] == "demo":
        weights, bias = demo()
        export_weights(weights, bias, out_path)
    else:
        weights, bias = demo()
        export_weights(weights, bias, out_path)
    return 0


if __name__ == "__main__":
    sys.exit(main())
