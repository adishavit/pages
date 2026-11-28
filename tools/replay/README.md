# Every-station replay

Tests the bus484 arrival predictions against what buses really did, using the app's own code (`bus484/index.html`).

1. `fetchraw.py <days>`: downloads Hasadna's raw per-minute feed (kept ~7 days) and keeps the TLV-Jerusalem corridor.
2. `replay.js <line> <line_ref> <days>`: for each trip, as the bus passes each station (and the midpoint of stretches over 3 km), rebuilds the traffic profile from what was published
   by then (1 min delay) and predicts arrival at every later station and midpoint. Truth = the time
   the bus passed, interpolated between its own reports (only where two reports <= 3 min apart bracket the point).
3. `score.py`: average error and bias by how far ahead, by stretch, hour and day; model vs timetable pace vs timetable.

Runs on GitHub Actions (`.github/workflows/replay.yml`), triggered by editing `RUN`.

## Findings log (Nov 2026 research round; replay of 22-26 Nov, local runs, MAXTRIPS 8-14 per day)

Traffic model vs the bare timetable (MAE minutes by minutes ahead; "tt-pace" = timetable pace from where the bus is):
- Lines 14 TLV (both dirs), 19 JLM (both dirs), 484 and 480 (return dirs): the model beats tt-pace from ~5 min ahead, 2-4x at 30 min+.
  14: 0-5 min 0.9-1.1, 20-30 min 3.0, 45-60 min 6.4-6.5. 19: 1.0-1.3 / 3.5-4.1 / 6.8-7.0.
- Bias differs by line and sign (14: -2..-6 min at long range; 19: +0.5..+2), so a single global correction does not work.
  A flat +4-5% on predicted time >10 min gains ~3% overall (~20% at 45-60 min only).
- The bare per-trip schedule is 10-14 min off on 19 and 484 even at short range (unverified: real lateness or a matching problem; check ttfetch.py
  against ride/stop ids for these lines before trusting it as a baseline). Fine on 14.

Tried and dropped:
- DWELL_MEASURED=1 (add the stop dwell at measured stops): worse at every horizon up to 45 min (bias goes from -2..-6 to +2..+5). Not the missing piece.
- Forecast (forecast.py): history per cell x 30-min time-of-day bin from the other days, blended with the live ratio (decay tau 15/30/60 min).
  Gain 2-5% at <=30 min, none or worse beyond; a same-day oracle only reaches ~8% at 45-60 min. The residual long-range error is systematic lateness,
  not traffic level. Not worth building. Untested on lines other than 14.
- Operator ETAs (D): not pursued (owner does not rely on them).

Congestion marks (v168): red needs >=3 distinct buses within 200 m and the planned speed is capped for the jam test (MIN_JAM_BUSES, PLAN_V_MAX);
planned speeds from timetable stop offsets can imply 100-200 km/h on short gaps. diag.js rebuilds the picture for any window from Stride.
Possible next: judge "jam" against the usual speed for that cell and hour (history) instead of the timetable.
