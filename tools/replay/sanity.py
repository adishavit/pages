#!/usr/bin/env python3
"""Sanity checks on replay output (out/*.jsonl), to run on small samples before a big run.
Per trip: moments, predictions, share of targets with a measured truth, en-route MAE at 0-5 / 5-15 / 15-30 min.
Flags: error > 0.5 min at under 2 min ahead (anchor problems), truth times going backwards along the route,
the 10 worst predictions (to look at by eye)."""
import json, glob, collections, datetime as dt

def hm(ms): return dt.datetime.fromtimestamp(ms / 1000, dt.timezone(dt.timedelta(hours=2))).strftime("%H:%M")
def mae(xs): return round(sum(abs(x) for x in xs) / len(xs), 2) if xs else None

for f in sorted(glob.glob("out/*.jsonl")):
    R = [json.loads(l) for l in open(f)]
    line = f.split("/")[-1][:-6]
    print(f"\n=== line {line}: {len(R)} predictions")
    byt = collections.defaultdict(list)
    for r in R: byt[(r["day"], r["trip"])].append(r)
    print(f"{'trip':>26} {'start':>5} {'mom':>4} {'pred':>5} {'targets':>7} | MAE 0-5  5-15  15-30 | at start")
    for (d, t), rs in sorted(byt.items(), key=lambda kv: kv[0][1].split("|")[1]):
        moms = sorted({r["T"] for r in rs}); er = [r for r in rs if not r.get("atStart")]
        tg = len({r["to"] for r in rs})
        b = lambda a, c: mae([r["err"] for r in er if a <= r["h"] < c])
        print(f"{t:>26} {hm(int(t.split('|')[1])):>5} {len(moms):>4} {len(rs):>5} {tg:>7} | {b(0,5)!s:>7} {b(5,15)!s:>5} {b(15,30)!s:>6} | "
              f"{sum(1 for r in rs if r.get('atStart'))}")
        # truth must increase along the route within one moment (h grows with 'to')
        for T in moms:
            row = sorted((r["to"], r["h"]) for r in rs if r["T"] == T)
            bad = [(a, b) for (a, ha), (b, hb) in zip(row, row[1:]) if hb < ha - 0.05]
            if bad: print(f"    ! {hm(T)} truth goes backwards between {bad[:2]}")
    short = [r for r in R if r["h"] < 2 and not r.get("atStart") and abs(r["err"]) > 0.5]
    print(f"  under 2 min ahead with |error| > 0.5 min: {len(short)} of {sum(1 for r in R if r['h'] < 2 and not r.get('atStart'))}")
    for r in sorted(R, key=lambda r: -abs(r["err"]))[:10]:
        print(f"  worst: trip {r['trip']} at {hm(r['T'])} from {r['from']} m to {r['to']} m, {r['h']} min ahead, err {r['err']:+.1f}"
              f" (plan {r['errPlan']:+.1f}), fix age {r['age']} s, atStart {r.get('atStart')}")
