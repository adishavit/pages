#!/usr/bin/env python3
"""Download the raw per-minute SIRI feed files (Open Bus / Hasadna) for given days, keep the TLV-Jerusalem corridor,
dedupe repeated fixes, write one compact gzip JSON-lines file per day: raw/<day>.jsonl.gz
Each row: [recordedMs, snapMs, vehicleRef, lineRef, tripStart, lat, lon, bearing, velocity, distFromStop]
Usage: fetchraw.py 2026-11-24 [2026-11-25 ...]"""
import sys, os, json, gzip, time, datetime as dt, concurrent.futures as cf
import brotli, requests

BASE = "https://open-bus-siri-requester.hasadna.org.il"
BBOX = (31.70, 32.15, 34.70, 35.30)          # lat min/max, lon min/max: TLV - Jerusalem corridor
H0, H1 = 3, 21                               # UTC hours [H0, H1): 05:00-23:00 local (winter, +02:00)
S = requests.Session()

def iso_ms(s):
    return int(dt.datetime.fromisoformat(s).timestamp() * 1000)

def one(day, h, m):
    url = f"{BASE}/{day.replace('-', '/')}/{h:02d}/{m:02d}.br"
    for k in range(4):
        try:
            r = S.get(url, timeout=30)
            if r.status_code == 404: return []
            r.raise_for_status()
            d = json.loads(brotli.decompress(r.content)); break
        except Exception:
            if k == 3: return None
            time.sleep(2 * (k + 1))
    snap = int(dt.datetime(*map(int, day.split('-')), h, m, tzinfo=dt.timezone.utc).timestamp() * 1000)
    out = []
    for dlv in d["Siri"]["ServiceDelivery"].get("StopMonitoringDelivery", []):
        for v in dlv.get("MonitoredStopVisit", []) or []:
            j = v.get("MonitoredVehicleJourney") or {}; loc = j.get("VehicleLocation") or {}
            try: lat, lon = float(loc["Latitude"]), float(loc["Longitude"])
            except Exception: continue
            if not (BBOX[0] <= lat <= BBOX[1] and BBOX[2] <= lon <= BBOX[3]): continue
            mc = j.get("MonitoredCall") or {}
            try: rec = iso_ms(v["RecordedAtTime"])
            except Exception: continue
            ts = j.get("OriginAimedDepartureTime"); ts = iso_ms(ts) if ts else None
            f = lambda x: float(x) if x not in (None, "") else None
            out.append([rec, snap, j.get("VehicleRef"), j.get("LineRef"), ts, lat, lon, f(j.get("Bearing")), f(j.get("Velocity")), f(mc.get("DistanceFromStop"))])
    return out

def day_file(day):
    path = f"raw/{day}.jsonl.gz"
    if os.path.exists(path): print(day, "cached"); return
    jobs = [(h, m) for h in range(H0, H1) for m in range(60)]
    seen, rows, failed = set(), [], 0
    with cf.ThreadPoolExecutor(8) as ex:
        for res in ex.map(lambda hm: one(day, *hm), jobs):
            if res is None: failed += 1; continue
            for r in res:
                key = (r[2], r[0])                     # vehicle + GPS time: drop repeats of the same fix
                if key in seen: continue
                seen.add(key); rows.append(r)
    rows.sort(key=lambda r: r[0])
    with gzip.open(path + ".tmp", "wt") as fh:
        for r in rows: fh.write(json.dumps(r, separators=(",", ":")) + "\n")
    os.replace(path + ".tmp", path)
    print(day, len(rows), "rows,", failed, "minutes failed", flush=True)

os.makedirs("raw", exist_ok=True)
for day in sys.argv[1:]: day_file(day)
