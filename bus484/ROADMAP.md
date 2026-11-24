# bus484 – roadmap and parked ideas

Last updated: 2026-11-24 (v53)

## Parked: better predictions (revisit later)

Goal: know how wrong our arrival predictions are, and learn to make them better.

### What exists (v53)
- Per bus, predictions for every station ahead. Methods: operator ETA (curlbus / Ministry of Transport), congestion model
  (speeds from all buses, adaptive smoothing), the bus's own speed, timetable plus current delay. Best method by measured error.
- Self-check while the page is open: when a bus passes a stop, earlier predictions are scored
  (⚙︎ › Diagnostics: error per method by how far ahead). Only learns while a phone has the page open, so data is sparse.

### Plan, in order
1. **Backtest lab.** Replay past days from the Open Bus archive (all positions are kept). At each minute use only the
   data that existed then, *including the 3–15 min reporting lag*. Predict downstream stops, compare with actual pass
   times (interpolated from the same positions). Report error by horizon (5/15/45 min), time of day, method.
   Benchmarks: timetable, historical average.
   - The operator ETAs are not archived, so that method can't be backtested. Option: have the relay start recording them
     (Cloudflare KV).
   - The workspace can't reach the Open Bus API, so run it in a browser (hidden lab page).
2. **Historical prior.** Usual section travel time by hour × weekday, saved as a small JSON the page loads.
3. **Kalman-style blend** of live congestion with the historical prior; tune the few hundred parameters by minimising
   backtest error with simple search, testing on held-out weeks. Keep it only if it beats step 1's baseline.
4. **"I'm on this bus" mode** (see below).

### Prior art
- Dailey, Wall et al., Seattle (1999/2001): Kalman filter on AVL + historical statistics, up to 1 h ahead.
- Cathey & Dailey, "A prescription for transit arrival/departure prediction using AVL data", Transp. Res. C 11 (2003).
- Crudden & Berrebi, "An Open-Source Framework to Implement Kalman Filter Bus Arrival Predictions" (TheTransitClock,
  Minneapolis–St. Paul), Netw. Spat. Econ. 2023, doi:10.1007/s11067-021-09541-w.
- Survey: "Survey of ETA prediction methods in public transport networks", arXiv:1904.05037 (comparisons in the field
  are often not like-for-like; always benchmark).
- Usual Kalman setup = previous bus on the same segment; weak for hourly lines. Our edge: probe speeds from all lines.

## Other open items
- HTTPS for videocortex.io (unblocks 📍 and alerts; main security gap).
- Relay v7 is written (tools/curlbus-relay-worker.js) but needs a manual paste into Cloudflare.
- Perf: cache the timetable and stop lookups per day (7 requests per load); a single relay call for all traffic probes.
- #14 saved line+stop pairs; Hebrew wording on the board; #5 ETA ranges once Diagnostics has ~30 samples per column.
