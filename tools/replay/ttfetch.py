#!/usr/bin/env python3
"""Each trip's OWN scheduled stop times, per day (the replay's timetable baseline).
usage: ttfetch.py <line> <line_ref> <day>...   ->  tt/<line_ref>-<day>.json  {tripStartMs: {stopCode: arrivalMs}}
Cached on disk: a file that exists is never fetched again. A few calls per line and day (routes, rides, ride stops in batches)."""
import sys, os, json, time, datetime as dt, urllib.request, urllib.parse
API = "https://open-bus-stride-api.hasadna.org.il"
def get(path, **q):
    url = f"{API}/{path}?" + urllib.parse.urlencode(q, safe=",")
    for k in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "bus484-replay"}), timeout=60) as r: return json.load(r)
        except Exception as e:
            if k == 3: raise
            time.sleep(2 * (k + 1))
def ms(s): return int(dt.datetime.fromisoformat(s).timestamp() * 1000)
line, ref, *days = sys.argv[1:]; os.makedirs("tt", exist_ok=True)
for day in days:
    out = f"tt/{ref}-{day}.json"
    if os.path.exists(out): print(out, "cached"); continue
    routes = [r for r in get("gtfs_routes/list", route_short_name=line, date_from=day, date_to=day, limit=100) if str(r["line_ref"]) == ref]
    if not routes: print(day, "no route for", ref); continue
    d0 = dt.datetime.fromisoformat(day).replace(tzinfo=dt.timezone.utc)
    W0 = (d0 - dt.timedelta(hours=6)).isoformat(); W1 = (d0 + dt.timedelta(hours=32)).isoformat()   # the whole local service day, incl. times past 24:00
    tt = {}
    for rt in routes:
        rides = get("gtfs_rides/list", gtfs_route_id=rt["id"], limit=1000)
        by = {r["id"]: ms(r["start_time"]) for r in rides}
        ids = list(by)
        for i in range(0, len(ids), 20):
            rows = get("gtfs_ride_stops/list", gtfs_ride_ids=",".join(map(str, ids[i:i + 20])), arrival_time_from=W0, arrival_time_to=W1, limit=2000)   # the API wants a time window with several ids
            for r in rows:
                if r.get("arrival_time"): tt.setdefault(str(by[r["gtfs_ride_id"]]), {})[str(r["gtfs_stop__code"])] = ms(r["arrival_time"])
    json.dump(tt, open(out, "w"), separators=(",", ":")); print(day, ref, len(tt), "trips")
