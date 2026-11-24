// Cloudflare Worker: CORS relay for curlbus.app (stop-arrivals JSON only).
// Deploy: dash.cloudflare.com -> Workers & Pages -> your worker -> Edit code -> paste this -> Deploy.
// v2: in-memory cache (the Cache API / cf.cacheTtl do nothing on *.workers.dev), and serve-stale on 429/5xx.
const ALLOWED_ORIGINS = ["https://videocortex.io", "http://videocortex.io", "https://adishavit.github.io"];
const FRESH_MS = 45_000;        // reuse an answer for 45 s
const STALE_MS = 10 * 60_000;   // on curlbus error/429, serve an answer up to 10 min old
const cache = new Map();        // path -> {t, body}; per isolate, best effort

export default {
  async fetch(req) {
    const origin = req.headers.get("Origin") || "";
    const cors = {
      "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
      "Access-Control-Allow-Headers": "Accept",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Expose-Headers": "X-Relay-Cache",
      "Vary": "Origin",
    };
    if (req.method === "OPTIONS") return new Response(null, { headers: cors });
    if (req.method !== "GET") return new Response("GET only", { status: 405, headers: cors });
    const path = new URL(req.url).pathname;
    if (!/^\/\d{1,6}$/.test(path))   // single stop code only, so this isn't an open proxy
      return new Response("expected /<stop_code>", { status: 400, headers: cors });

    const reply = (body, status, tag) => new Response(body, {
      status, headers: { ...cors, "Content-Type": "application/json; charset=utf-8", "X-Relay-Cache": tag },
    });
    const hit = cache.get(path), now = Date.now();
    if (hit && now - hit.t < FRESH_MS) return reply(hit.body, 200, "fresh");

    try {
      const r = await fetch("https://curlbus.app" + path, {
        headers: { Accept: "application/json", "User-Agent": "bus484-relay (personal use, ~1 req/min)" },
      });
      if (r.ok) {
        const body = await r.text();
        cache.set(path, { t: now, body });
        if (cache.size > 50) cache.delete(cache.keys().next().value);
        return reply(body, 200, "miss");
      }
      if (hit && now - hit.t < STALE_MS) return reply(hit.body, 200, "stale-" + r.status);
      return reply(JSON.stringify({ error: "curlbus HTTP " + r.status }), r.status, "error");
    } catch (e) {
      if (hit && now - hit.t < STALE_MS) return reply(hit.body, 200, "stale-error");
      return reply(JSON.stringify({ error: String(e) }), 502, "error");
    }
  },
};
