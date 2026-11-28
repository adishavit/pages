# Every-station replay

Tests the bus484 arrival predictions against what buses really did, using the app's own code (`bus484/index.html`).

1. `fetchraw.py <days>`: downloads Hasadna's raw per-minute feed (kept ~7 days) and keeps the TLV-Jerusalem corridor.
2. `replay.js <line> <line_ref> <days>`: for each trip, as the bus passes each station (and the midpoint of stretches over 3 km), rebuilds the traffic profile from what was published
   by then (1 min delay) and predicts arrival at every later station and midpoint. Truth = the time
   the bus passed, interpolated between its own reports (only where two reports <= 3 min apart bracket the point).
3. `score.py`: average error and bias by how far ahead, by stretch, hour and day; model vs timetable pace vs timetable.

Runs on GitHub Actions (`.github/workflows/replay.yml`), triggered by editing `RUN`.
