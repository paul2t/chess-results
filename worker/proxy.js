// Cloudflare Worker: a tiny read-only CORS proxy for chess-results.com pages.
//   GET https://<worker>/?url=https%3A%2F%2Fchess-results.com%2Ftnr1542962.aspx%3Flan%3D1
// - only https://*.chess-results.com is reachable (not an open proxy)
// - only the origins listed below may read the response from a browser
// - responses are cached for 20 s at the edge, so many phones refreshing = one request upstream

const ALLOWED_ORIGINS = [
  'https://paul2t.github.io',
  'http://localhost:8080',
  'http://127.0.0.1:8080',
];
const HOST_RE = /^([a-z0-9-]+\.)*chess-results\.com$/i;
const TTL_SECONDS = 20;

export default {
  async fetch(request, _env, ctx) {
    const origin = request.headers.get('Origin') || '';
    const cors = {
      'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
      Vary: 'Origin',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: { ...cors, 'Access-Control-Allow-Methods': 'GET', 'Access-Control-Max-Age': '86400' },
      });
    }
    if (request.method !== 'GET') return new Response('Method not allowed', { status: 405, headers: cors });

    let target;
    try {
      target = new URL(new URL(request.url).searchParams.get('url') ?? '');
    } catch {
      return new Response('Missing or invalid ?url=', { status: 400, headers: cors });
    }
    if (target.protocol !== 'https:' || !HOST_RE.test(target.hostname)) {
      return new Response('Only chess-results.com is allowed', { status: 403, headers: cors });
    }

    const cache = caches.default;
    const key = new Request(target.toString());
    let cached = await cache.match(key);
    if (!cached) {
      const upstream = await fetch(target.toString(), {
        headers: {
          'User-Agent': 'chess-results-viewer (+https://github.com/paul2t/chess-results)',
          'Accept-Language': 'en',
        },
      });
      const body = await upstream.arrayBuffer();
      cached = new Response(body, {
        status: upstream.status,
        headers: {
          'Content-Type': upstream.headers.get('Content-Type') || 'text/html; charset=utf-8',
          'Cache-Control': `public, max-age=${TTL_SECONDS}`,
        },
      });
      if (upstream.ok) ctx.waitUntil(cache.put(key, cached.clone()));
    }

    const out = new Response(cached.body, cached);
    for (const [k, v] of Object.entries(cors)) out.headers.set(k, v);
    return out;
  },
};
