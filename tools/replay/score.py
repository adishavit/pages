#!/usr/bin/env python3
"""Score the every-station replay (out/<line>.jsonl): average error (MAE) and bias, in minutes, by horizon, by stretch,
by hour, for the congestion model (err), timetable pace from where the bus is (errPlan) and the bare timetable
(errSched, stations only). Writes summary.json and prints tables."""
import json, glob, collections, statistics as st, sys

HB = [(0, 5), (5, 10), (10, 20), (20, 30), (30, 45), (45, 60)]
def hbin(h):
    for a, b in HB:
        if a <= h < b: return f"{a}-{b}"
def agg(xs):
    xs = [x for x in xs if x is not None]
    if not xs: return None
    return {"n": len(xs), "mae": round(sum(abs(x) for x in xs) / len(xs), 2), "bias": round(sum(xs) / len(xs), 2),
            "p90": round(sorted(abs(x) for x in xs)[int(0.9 * (len(xs) - 1))], 2)}

summary = {}
for f in sorted(glob.glob("out/*.jsonl")):
    line = f.split("/")[-1][:-6]
    R0 = [json.loads(l) for l in open(f)]
    R = [r for r in R0 if not r.get("atStart")]     # en route; predictions while still at the first stop scored apart
    S0 = agg([r["err"] for r in R0 if r.get("atStart") and 5 <= r["h"] < 30])
    if not R: continue
    trips = len({(r["day"], r["trip"]) for r in R})
    S = {"predictions": len(R), "trips": trips, "days": sorted({r["day"] for r in R})}
    # by horizon, three methods
    by = collections.defaultdict(lambda: collections.defaultdict(list))
    for r in R:
        b = hbin(r["h"]);
        if not b: continue
        by[b]["model"].append(r["err"]); by[b]["plan"].append(r["errPlan"]); by[b]["sched"].append(r["errSched"])
    S["byHorizon"] = {b: {m: agg(v) for m, v in by[b].items()} for b in [f"{a}-{c}" for a, c in HB] if b in by}
    # by stretch: target km, horizons 5-30 min
    bk = collections.defaultdict(list)
    for r in R:
        if 5 <= r["h"] < 30: bk[r["to"] // 2000 * 2].append(r["err"])
    S["byTargetKm"] = {k: agg(v) for k, v in sorted(bk.items())}
    # by hour of day (local), horizons 5-30 min
    bh = collections.defaultdict(list)
    for r in R:
        if 5 <= r["h"] < 30: bh[r["hour"]].append(r["err"])
    S["byHour"] = {h: agg(v) for h, v in sorted(bh.items())}
    # by day, horizons 5-30
    bd = collections.defaultdict(list)
    for r in R:
        if 5 <= r["h"] < 30: bd[r["day"]].append(r["err"])
    S["byDay"] = {d: agg(v) for d, v in sorted(bd.items())}
    # measured vs not (any measured cell on the way)
    bm = collections.defaultdict(list)
    for r in R:
        if 5 <= r["h"] < 30: bm["measured" if r["measured"] else "timetable only"].append(r["err"])
    S["byCoverage"] = {k: agg(v) for k, v in bm.items()}
    S["atStart_5to30"] = S0
    summary[line] = S
    print(f"\n== line {line}: {len(R)} en-route predictions, {trips} trips, days {S['days'][0]}..{S['days'][-1]}; still at first stop (5-30 min ahead): {S0}")
    print(f"{'ahead':>8} {'n':>6} | {'model MAE':>9} {'bias':>6} {'p90':>5} | {'plan MAE':>8} {'bias':>6} | {'sched MAE':>9} {'bias':>6}")
    for b, v in S["byHorizon"].items():
        m, p, s = v["model"], v["plan"], v.get("sched")
        print(f"{b:>8} {m['n']:>6} | {m['mae']:>9} {m['bias']:>6} {m['p90']:>5} | {p['mae']:>8} {p['bias']:>6} | "
              + (f"{s['mae']:>9} {s['bias']:>6}" if s else f"{'-':>9} {'-':>6}"))
json.dump(summary, open("summary.json", "w"), indent=1)
