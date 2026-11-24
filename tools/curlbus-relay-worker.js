// Cloudflare Worker v3: relay for the bus tracker page.
//   GET /<stop_code>        -> curlbus.app stop arrivals (JSON), CORS-enabled
//   GET /osrm/<lon,lat;...> -> OSRM road geometry through the given points
// Deploy: dash.cloudflare.com -> Workers & Pages -> your worker -> Edit code -> paste -> Deploy.
//
// Load protection (so sharing the page does not hammer curlbus / OSRM):
// - one upstream request per stop per 45 s, shared by all viewers this worker instance serves;
//   simultaneous requests for the same stop share one upstream fetch
// - on upstream error / 429, serve the last good answer for up to 10 min
// - OSRM shapes cached 24 h (routes do not change)
// - per-visitor limit: 30 requests/min
// - Cache-Control headers, so Cloudflare's Workers Cache (if enabled with Wrangler) and browsers can reuse answers
// Note: the in-memory cache is per worker instance (best effort), not global; *.workers.dev has no Cache API.

const ALLOWED_ORIGINS = ["https://videocortex.io", "http://videocortex.io", "https://adishavit.github.io"];
const STOP_FRESH_MS = 45_000, STOP_STALE_MS = 10 * 60_000, OSRM_TTL_MS = 24 * 3600_000;
const PER_IP_PER_MIN = 30;

const cache = new Map();     // key -> {t, body, status}
const inflight = new Map();  // key -> Promise<{body,status}>
const hits = new Map();      // ip -> {minute, n}

function cors(req) {
  const o = req.headers.get("Origin") || "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(o) ? o : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers": "Accept",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Expose-Headers": "X-Relay-Cache",
    "Vary": "Origin",
  };
}
function limited(req) {
  const ip = req.headers.get("CF-Connecting-IP") || "?", m = Math.floor(Date.now() / 60000);
  const h = hits.get(ip);
  if (!h || h.minute !== m) { hits.set(ip, { minute: m, n: 1 }); if (hits.size > 5000) hits.clear(); return false; }
  return ++h.n > PER_IP_PER_MIN;
}
function remember(key, v) {
  cache.set(key, v);
  if (cache.size > 300) cache.delete(cache.keys().next().value);
}
// fetch upstream once per key at a time; everyone waiting shares the result
async function shared(key, url, headers) {
  if (inflight.has(key)) return inflight.get(key);
  const p = (async () => {
    const r = await fetch(url, { headers });
    return { body: await r.text(), status: r.status };
  })().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

export default {
  async fetch(req) {
    const c = cors(req);
    if (req.method === "OPTIONS") return new Response(null, { headers: c });
    if (req.method !== "GET") return new Response("GET only", { status: 405, headers: c });
    if (limited(req)) return new Response(JSON.stringify({ error: "too many requests" }), { status: 429, headers: { ...c, "Retry-After": "60" } });

    const path = new URL(req.url).pathname;
    const reply = (body, status, tag, maxAge) => new Response(body, {
      status,
      headers: { ...c, "Content-Type": "application/json; charset=utf-8", "X-Relay-Cache": tag,
                 "Cache-Control": status === 200 ? `public, max-age=${maxAge}` : "no-store" },
    });
    const now = Date.now();

    // --- road geometry ---
    let m = path.match(/^\/osrm\/((?:-?\d{1,3}\.\d{1,7},-?\d{1,2}\.\d{1,7};){1,99}-?\d{1,3}\.\d{1,7},-?\d{1,2}\.\d{1,7})$/);
    if (m) {
      const key = "osrm:" + m[1], hit = cache.get(key);
      if (hit && now - hit.t < OSRM_TTL_MS) return reply(hit.body, 200, "fresh", 86400);
      try {
        const r = await shared(key, `https://router.project-osrm.org/route/v1/driving/${m[1]}?overview=full&geometries=geojson`,
                               { "User-Agent": "bus-tracker-relay (cached 24h)" });
        if (r.status === 200) { remember(key, { t: now, body: r.body }); return reply(r.body, 200, "miss", 86400); }
        if (hit) return reply(hit.body, 200, "stale-" + r.status, 3600);
        return reply(JSON.stringify({ error: "osrm HTTP " + r.status }), r.status, "error", 0);
      } catch (e) {
        if (hit) return reply(hit.body, 200, "stale-error", 3600);
        return reply(JSON.stringify({ error: String(e) }), 502, "error", 0);
      }
    }

    // --- stop arrivals ---
    m = path.match(/^\/(\d{1,6})$/);
    if (!m) return new Response("expected /<stop_code> or /osrm/<lon,lat;...>", { status: 400, headers: c });
    const key = "stop:" + m[1], hit = cache.get(key);
    if (hit && now - hit.t < STOP_FRESH_MS) return reply(hit.body, 200, "fresh", 30);
    try {
      const r = await shared(key, "https://curlbus.app/" + m[1],
                             { Accept: "application/json", "User-Agent": "bus-tracker-relay (shared cache, ~1 req/min/stop)" });
      if (r.status === 200) { remember(key, { t: Date.now(), body: r.body }); return reply(r.body, 200, "miss", 30); }
      if (hit && now - hit.t < STOP_STALE_MS) return reply(hit.body, 200, "stale-" + r.status, 30);
      return reply(JSON.stringify({ error: "curlbus HTTP " + r.status }), r.status, "error", 0);
    } catch (e) {
      if (hit && now - hit.t < STOP_STALE_MS) return reply(hit.body, 200, "stale-error", 30);
      return reply(JSON.stringify({ error: String(e) }), 502, "error", 0);
    }
  },
};
