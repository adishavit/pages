#!/usr/bin/env python3
"""Forecast test (leave one day out): does 'history for the hour, nudged by the live picture' beat the current live-only model
at 20-90 min ahead?  usage: forecast.py <name e.g. 14-d1> [tau_min ...]
Inputs: out/<name>.jsonl (replay predictions), snap/<name>.jsonl (traffic picture at each moment).
Method, per prediction (bus at `from`, target `to`, moment T): the model's run time over the stretch is sum(len * pace[k]) from the
picture at T; the forecast replaces pace[k] by  hist(k, time the bus gets there) * (live/hist now)^w,  w = exp(-ahead/tau), where
hist = median over the OTHER days of the measured pace of that cell in a 30 min bin of the day; stops/dwell stay as the model has them."""
import json, sys, os, collections, numpy as np
STRIDE = int(os.environ.get('STRIDE', 1))   # score every Nth prediction (speed)
name = sys.argv[1]; taus = [float(x) for x in sys.argv[2:]] or [15, 30, 60]
BIN = 30                                   # minutes of day per history bin
C = 100.0
def tod(T): return int(((T / 60000) % 1440) // BIN)      # UTC time of day; one fixed zone so bins are consistent
snaps = {}; dayT = collections.defaultdict(list)
for l in open(f"snap/{name}.jsonl"):
    r = json.loads(l); pp = r["p"]; pp = [pp[str(i)] for i in range(len(pp))] if isinstance(pp, dict) else pp   # (a typed array serialises as an object)
    snaps[(r["day"], r["T"])] = (np.array(pp), np.array([c == "1" for c in r["q"]])); dayT[r["day"]].append(r["T"])
days = sorted(dayT)
n = len(next(iter(snaps.values()))[0])
# per day, per bin: cell pace samples where measured
H = {d: collections.defaultdict(lambda: [[] for _ in range(n)]) for d in days}
for (d, T), (p, q) in snaps.items():
    b = tod(T); cell = H[d][b]
    for k in np.nonzero(q)[0]: cell[k].append(p[k])
ORACLE = os.environ.get("ORACLE") == "1"
def hist(excl, b, k):
    v = []
    for d in days:
        if (d != excl) == ORACLE: continue
        for bb in (b - 1, b, b + 1):                           # +-1 bin: smoother
            v += H[d][bb % 48][k] if bb % 48 in H[d] else []
    return float(np.median(v)) if len(v) >= 3 else None
cache = {}
def hc(excl, b, k):
    key = (excl, b, k)
    if key not in cache: cache[key] = hist(excl, b, k)
    return cache[key]
res = collections.defaultdict(lambda: collections.defaultdict(list))   # horizon bin -> method -> errors (min)
HB = [(0, 10), (10, 20), (20, 30), (30, 45), (45, 60), (60, 90)]
def hbin(h):
    for a, b in HB:
        if a <= h < b: return f"{a}-{b}"
cnt = 0
for i, l in enumerate(open(f"out/{name}.jsonl")):
    if i % STRIDE: continue
    r = json.loads(l); hb = hbin(r["h"])
    if hb is None: continue
    key = (r["day"], r["T"])
    if key not in snaps: continue
    p, q = snaps[key]; day = r["day"]
    a, b2 = int(r["from"] // C), int(min(r["to"] // C, n - 1))
    if b2 <= a: continue
    m = r["h"] * 60 + r["err"] * 60 + r["age"]                  # model travel seconds from the bus's last fix
    cells = np.arange(a, b2 + 1)
    run_static = float((C * p[cells]).sum())
    if run_static <= 0 or m <= 0: continue
    scale = m / run_static; t_arr = np.cumsum(C * p[cells]) * scale / 60   # minutes from the fix until the bus is at each cell
    cnt += 1
    res[hb]["model"].append(r["err"])
    for tau in taus:
        run_f = 0.0
        for j, k in enumerate(cells):
            ahead = max(0.0, t_arr[j] - r["age"] / 60)           # minutes from now
            T2 = r["T"] + (t_arr[j] - r["age"] / 60) * 60000
            hb_now, hb_then = hc(day, tod(r["T"]), k), hc(day, tod(T2), k)
            pk = p[k]
            if hb_then is None: pf = pk
            elif q[k] and hb_now: pf = hb_then * (pk / hb_now) ** np.exp(-ahead / tau)
            else: pf = hb_then
            run_f += C * pf
        res[hb][f"tau{int(tau)}"].append(r["err"] + (run_f - run_static) * scale / 60)
print(name, cnt, "predictions;  MAE / bias (min) by minutes ahead")
meths = ["model"] + [f"tau{int(t)}" for t in taus]
print(f"{'ahead':>7} {'n':>6} | " + " | ".join(f"{m:>16}" for m in meths))
for hb in [f"{a}-{b}" for a, b in HB]:
    if hb not in res: continue
    print(f"{hb:>7} {len(res[hb]['model']):>6} | " + " | ".join(f"{np.mean(np.abs(res[hb][m])):7.2f} / {np.mean(res[hb][m]):+6.2f}" for m in meths))
