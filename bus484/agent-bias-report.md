# Congestion-model late bias: investigation report (2026-11-25)

**Status: partial.** I could not run any replays. The built-in browser and Claude in Chrome were both offline, the device bridge was not connected, and the workspace proxy blocks the Stride API (403). Everything below comes from reading the code plus timetable and OSRM numbers I fetched through a web-fetch tool. That tool only allows small queries, so I could not get position data. I have **not** measured probe-pair shares or the MAE/bias of any fix. A ready-to-run diagnostic is in `/tmp/agent/bias-diag.js`.

## Root cause 1 (strong for line 19): dwell is counted twice
- `probePairs` drops only pairs that moved less than 25 m with one end at a stop. Fixes come about every 60 s. A 20–40 s dwell plus the braking and pulling away almost always sits inside a pair that moved more than 25 m, so it stays in the probe pace. The probes on the same stops are mostly buses that stop there too (other line-19 buses, local lines). `travelTime` then adds `DWELL = 20 s` for every intermediate stop again.
- Test against the timetable, ride 164075076 (45 stops in 46 min). Intermediate stops in the last 10/20/30 scheduled minutes are 12/22/32, so DWELL adds **4.0/7.3/10.7 min**. The observed bias is **+3.2/+6.0/+7.6 min**, about 75–80 % of that, and both grow linearly with stops ahead. That is the pattern of double counting. It is not quite 100 % because long dwells (pairs that moved less than 25 m) are excluded from the probes.
- For 480 and 484 this explains only a little. 480 has 5 stops in all (40 s within the last 10 min). 484 has 3–4 intermediate stops in the last 10–20 min (60–80 s).

## Root cause 2 (likely for 480 and 484, unconfirmed): something slow in the last ~10 min
- On 480 and 484 the bias is flat across horizons (+5…+6 and +4.5/+4.7/+2.8 min). So it builds up inside the last ~10 min: Hemed (km 53.9) → Harel (55.8) → Jerusalem entrance / Central Bus Station or Mevaseret. It is not spread along the highway.
- Checked and rejected: OSRM's route differs from the GTFS shape. Its legs are 5.51/49.33/1.93/6.70 km against 4.59/49.33/1.94/6.70 km in GTFS, so only the first leg differs and the end is fine. The timetable prior also can't be the cause: it plans that stretch at about 88 km/h, which pulls predictions *early*.
- Best remaining candidate is hypothesis 2. A standing pair that is not at a stop becomes an observation with 0 m and the full Δt, and no filter limits how long a vehicle may stand. One parked, laid-over or break-taking bus within 50 m of the route adds minutes of zero-distance time to every kernel around it. The live 480 bus that stood about 8 min near km 55 suggests buses do hold there. The stop zones there are looked up only by the line's own cities, and only within 40 m.
- The cross-street problem (hypothesis 1) has the same effect at junctions on the entrance boulevards. Its size is unmeasured.

## Recommended changes (to test before shipping)
```js
// 1) dwellBetween (and the same rule in advance()): add DWELL only where the pace is NOT measured
function dwellBetween(a0,a1){ return intermediateStops().filter(s=>s.along>a0+30&&s.along<a1-30&&
  !(prof&&prof.conf[Math.min(prof.n-1,Math.floor(s.along/prof.C))]>=ASM.minConf)).length*DWELL; }
// 2) probePairs, after `const moved=...`:
if(Number.isFinite(q.brg)&&q.brg>0&&angDiff(q.brg,routeBearing(q.a))>60) continue;   // all pairs, not only moved<30
if(moved>=60&&Math.abs(da)/moved<0.6) continue;    // crossing or parallel road: not moving along our road
if(moved<25&&parked[k-1]&&parked[k]) continue;     // vehicle stayed within 30 m for >180 s: parked / layover / break
```
(`parked[]` is worked out per vehicle before the pair loop, as in `cleanPP` in the diagnostic.) These rules are physical criteria, not tuned constants. The parked rule may also drop real standstill jams longer than 3 min; watch for that.

**Expected, not measured:** change 1 should take most of line 19's bias away. It may overshoot by −1 to −3 min at 30 min out. Change 2 is the candidate fix for 480 and 484; its effect can't be estimated without data.

## Next step (needs the browser)
Eval `/tmp/agent/bias-diag.js` on each line page (480/7020, 484/19094, 19/10802), run `__diagStart()`, then read `__diag.summary` when `__diag.status` is "done". It reports:
- MAE, bias and leave-one-out corrected MAE at 10/20/30 min for the variants base, dw0, clean and both;
- the share of probe time that is standing / parked / cross-street / wrong-bearing;
- the excess seconds per km bin before the end (where the error builds up).

It uses the same method as `__REPLAY` (1-min lag, 25-min window, end = journey distance ≥ total − 150 m) and checks that its base variant matches the app's `probePairs`.

## Learning the offset online
It is workable, but not as a full 2-hour replay. That would need every bbox for 2 h (about 20 boxes on 480, on the Route 1 corridor), which I'd guess at hundreds of thousands of rows (100+ MB) per page load. A cheaper version:
- keep the probe rows the page already fetches and rebuild the profile at 2–3 earlier moments (window about 45–60 min, 2–3× today's fetch);
- score those profiles against the section times of buses that have since crossed the same sections (any line);
- use the result as a per-section multiplier.

Fixing causes 1 and 2 first should make the offset small and stable. The leave-one-out corrected MAE (1.4–3.7 min) shows that a constant per line already captures most of it.
