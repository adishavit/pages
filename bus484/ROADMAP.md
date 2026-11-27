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

### "Waze for my bus" (explored 2026-11-24)
- Pick my bus (tap; later auto via location once HTTPS) + destination → live ETA from bus position + live section
  speeds (+ operator ETA when available); timetable only if clearly labelled. Share via WhatsApp/SMS link
  (works on http; Web Share API needs HTTPS); the recipient's link shows the bus moving and the ETA updating, then "arrived".
- Findings (line 480, 23:48):
  - curlbus returned HTTP 500 for every 480 stop tested (Karliback fine), so the operator ETA is a bonus, not the backbone.
  - Express-vs-local bias: city-section probe speeds come from local buses (21–39 km/h at the Jerusalem entrance) and
    understate an express bus; the timetable assumes ~90 km/h right into the station.
    23:20 bus predictions: timetable 00:04, own speed 00:10, congestion model 00:22 (outcome check scheduled).
  - Trips appear in the feed exactly 5 min before their scheduled departure, already at the first station
    (3 trips on 480). Nothing earlier, so positions on the way to the first station aren't visible. Verify across lines in the backtest lab.

### Data check, 20 lines × 06:00–11:00 on 2026-11-24 (Open Bus archive, 41k positions, 427 trips)
**When trips appear:** 81% first appear exactly 5 min before scheduled departure (hard cap: none ≥9 min); 12% appear
only after scheduled departure; 1/427 seen moving >300 m before departure → the drive to the first station is not
visible. 484: both morning trips appeared 13 min *after* scheduled departure.

**Arrival prediction replay** (360 complete trips; prediction made at 10/20/30 min before actual arrival at the last stop,
with a simulated 1 min data lag; fair test: only trips finished before the prediction moment):

| method | MAE 10 min | 20 min | 30 min | bias |
|---|---|---|---|---|
| recent trips (last 3 finished trips: time from this point to the end) | **2.1** | **3.0** | **4.3** | ~0 |
| bus's own speed, last 10 min | 4.7 | 10.2 | 14.5 | +3…+11 (too late) |
| timetable-like (scheduled departure + usual trip length) | 11.1 | 11.9 | 13.0 | −6…−8 (too early) |

Takeaways:
- "Recent trips" (the classic previous-bus Kalman input) wins clearly on frequent lines, no bias.
- Own-speed extrapolation is poor and biased late (it includes stops and lights); our "est" method should drop in rank.
- Caveats: frequent urban lines dominate the sample; the hourly 484/480 have few trips, and their "last 3 trips" are
  1–3 h old, so they need cross-line probes (our congestion model, untested here) or same-time-yesterday history.
  "Timetable-like" is a proxy, not the published timetable. One morning only.
- The archive's `distance_from_journey_start` is populated (0 nulls), so replay doesn't need map matching.

### Congestion-model replay (the app's own model, 2026-11-24, 06:00–21:00)
Method: for each completed trip, at 10/20/30 min before its actual arrival at the last stop, the app's congestion
profile is rebuilt from *only* the positions of all buses along the route in the preceding ~20 min, available by then
(each record's feed-snapshot time + publishing delay of 1 or 6 min), and arrival is predicted. Same moments for the
other methods. "Corrected" = constant offset learned from the *other* trips of the line (leave-one-out, fair).

Average error, minutes, 1 min delay (positive bias = predicted too late):

| line | trips | congestion model | bias | **corrected** | recent trips | timetable pace (corrected) |
|---|---|---|---|---|---|---|
| 480 TLV→Jerusalem express, 63 km | 9 | 5.5 / 5.3 / 6.2 | +5…+6 | **1.4 / 2.3 / 2.1** | 2.6 / 5.2 / 4.4 | 3.2 / 6.8 / 10.6 (1.4 / 3.1 / 5.8) |
| 484 TLV→Mevaseret, hourly, 58 km | 10 | 4.5 / 4.8 / 4.4 | +3…+5 | **2.2 / 2.2 / 3.7** | 2.7 / 5.2 / 13.1 | 1.3 / 5.4 / 10.1 |
| 19 Jerusalem city, 17 km, 45 stops | 13 | 3.2 / 6.0 / 7.6 | +3…+8 | **1.6 / 2.9 / 3.2** | 2.0 / 3.2 / 6.0 | 3.7 / 8.1 / 13.3 (1.2 / 2.5 / 3.8) |

Findings:
- The congestion model is consistently **too late**, but its error is mostly a stable offset. Once corrected, it's the
  best or close to it, and stays good at 30 min out where recent trips (hourly lines) and the timetable fall apart.
- Two probable sources of the offset: (a) city sections are measured from local buses (slower than an express);
  (b) the fixed 20 s stop allowance per intermediate station double-counts on many-stop lines (line 19: bias grows with
  stops ahead).
- Next: per-line/per-section correction learned from replays (the "learning" step), and test DWELL=0 / dwell only at
  stops where this line actually stops; prefer probes of similar buses (same line/express) in city sections.
- Raw own-speed extrapolation is unusable beyond ~10 min (484: 52 min average error at 30 min).
- The publishing delay (1 vs 6 min) mattered little for the congestion model (5.3 vs 6.0 at 20 min on 480).
- The government feed's own delay: median ~30 s from GPS time to feed snapshot (90%: 2 min, 99%: 4 min).
- Archive API quirk: limit=20000 (and 5000 on box queries) is rejected as a network error; use limit=1000 + offset.

### Resilience found 2026-11-25 00:00
- Open Bus hadn't published 25 Nov's timetable at midnight (0 routes for any line). v54: fall back to the latest
  comparable day (Sun–Thu ↔ Sun–Thu; Fri/Sat ↔ a week earlier), shifted, labelled in the status line.

## Other open items
- HTTPS for videocortex.io (unblocks 📍 and alerts; main security gap).
- Relay v7 is written (tools/curlbus-relay-worker.js) but needs a manual paste into Cloudflare.
- Perf: cache the timetable and stop lookups per day (7 requests per load); a single relay call for all traffic probes.
- #14 saved line+stop pairs; Hebrew wording on the board; #5 ETA ranges once Diagnostics has ~30 samples per column.

## Deferred: rename to "Pluribus" + own repo (decided 2026-11-27)
- New repo `adishavit/pluribus` with GitHub Pages → served at `videocortex.io/pluribus/` (project repos inherit the
  user site's custom domain, as `pages` does today). Same origin, so localStorage (saved stops, recent lines, traffic
  cache) carries over; no migration needed.
- Rename in the app: `<title>`, header/About text, manifest/home-screen name if any. Keep `bus484/` as a redirect
  stub (meta refresh + JS that keeps the query string) so bookmarks and home-screen icons keep working.
- Name clash to accept: Apple TV+ series "Pluribus" (2025) dominates search results.
- HTTPS is a separate fix (domain level, not repo level): see below.

## HTTPS for videocortex.io (user action)
- Moving to its own repo does NOT change HTTPS: every repo under videocortex.io shares the domain's certificate.
- Fix: DNS of videocortex.io must point only to GitHub Pages (apex A 185.199.108–111.153, optional AAAA,
  `www` CNAME → adishavit.github.io; no extra/parking A records, no CAA blocking Let's Encrypt), then
  adishavit.github.io repo → Settings → Pages → Enforce HTTPS (cert can take up to 24 h).
- Unblocks: geolocation ("nearest stop" pin, hidden today), service worker/offline, PWA install.
- Does not by itself fix the live relay being blocked on some networks (that's the workers.dev domain).
