// Cloudflare Worker: CORS relay for curlbus.app (stop-arrivals JSON only).
// Deploy: dash.cloudflare.com -> Workers & Pages -> Create -> "Hello World" worker -> paste this -> Deploy.
// Then open: https://videocortex.io/pages/bus484/?relay=https://<your-worker>.workers.dev  (remembered on that phone)
const ALLOWED_ORIGINS = ["https://videocortex.io", "http://videocortex.io", "https://adishavit.github.io"];

export default {
  async fetch(req) {
    const origin = req.headers.get("Origin") || "";
    const cors = {
      "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
      "Access-Control-Allow-Headers": "Accept",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Vary": "Origin",
    };
    if (req.method === "OPTIONS") return new Response(null, { headers: cors });
    if (req.method !== "GET") return new Response("GET only", { status: 405, headers: cors });
    const path = new URL(req.url).pathname;
    if (!/^\/\d{1,6}(\+\d{1,6}){0,40}$/.test(path))   // only stop-code lists, so this isn't an open proxy
      return new Response("expected /<stop>+<stop>...", { status: 400, headers: cors });
    try {
      const r = await fetch("https://curlbus.app" + path, {
        headers: { Accept: "application/json", "User-Agent": "bus484-relay (personal, ~1 req/min)" },
        cf: { cacheTtl: 20, cacheEverything: true },     // shared 20 s cache: be gentle with curlbus
      });
      return new Response(r.body, {
        status: r.status,
        headers: { ...cors, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "max-age=20" },
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: String(e) }), { status: 502, headers: cors });
    }
  },
};
