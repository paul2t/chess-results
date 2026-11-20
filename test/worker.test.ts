import { test } from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error plain JS module without types
import worker from '../worker/proxy.js';

const ORIGIN = 'https://paul2t.github.io';
const SEARCH = 'https://s2.chess-results.com/TurnierSuche.aspx?lan=1&SNode=S0';
const proxy = (target: string) => `https://proxy.example/?url=${encodeURIComponent(target)}`;

interface Seen { url: string; method: string; body: string | null; type: string | null }

function setup() {
  const seen: Seen[] = [];
  const cached = new Map<string, Response>();
  (globalThis as { caches?: unknown }).caches = {
    default: {
      match: async (r: Request) => cached.get(r.url)?.clone(),
      put: async (r: Request, res: Response) => { cached.set(r.url, res); },
    },
  };
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    seen.push({
      url: String(url), method: init?.method ?? 'GET',
      body: typeof init?.body === 'string' ? init.body : null,
      type: new Headers(init?.headers).get('Content-Type'),
    });
    return new Response('<html>' + 'x'.repeat(300) + '</html>', { headers: { 'Content-Type': 'text/html' } });
  }) as typeof fetch;
  return { seen, cached, ctx: { waitUntil: (_p: Promise<unknown>) => {} } };
}

const post = (target: string, body: string, origin = ORIGIN) =>
  new Request(proxy(target), { method: 'POST', body, headers: { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded' } });

test('worker: the search form can be POSTed and is never cached', async () => {
  const { seen, cached, ctx } = setup();
  const res = await worker.fetch(post(SEARCH, 'a=1&b=2'), {}, ctx);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  assert.equal(res.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(seen, [{ url: SEARCH, method: 'POST', body: 'a=1&b=2', type: 'application/x-www-form-urlencoded' }]);
  assert.equal(cached.size, 0);
});

test('worker: POST is refused for other pages, other hosts, other origins and huge bodies', async () => {
  const { seen, ctx } = setup();
  assert.equal((await worker.fetch(post('https://chess-results.com/tnr1542962.aspx', 'a=1'), {}, ctx)).status, 403);
  assert.equal((await worker.fetch(post('https://example.com/TurnierSuche.aspx', 'a=1'), {}, ctx)).status, 403);
  assert.equal((await worker.fetch(post(SEARCH, 'a=1', 'https://evil.example'), {}, ctx)).status, 403);
  assert.equal((await worker.fetch(post(SEARCH, 'x'.repeat(100_001)), {}, ctx)).status, 413);
  assert.equal(seen.length, 0, 'nothing reached chess-results');
});

test('worker: GET still works and is cached; the preflight allows POST', async () => {
  const { seen, cached, ctx } = setup();
  const page = 'https://chess-results.com/tnr1542962.aspx?lan=1';
  const get = () => worker.fetch(new Request(proxy(page), { headers: { Origin: ORIGIN } }), {}, ctx);
  assert.equal((await get()).status, 200);
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(cached.size, 1);
  assert.equal((await get()).status, 200);
  assert.equal(seen.length, 1, 'second GET came from the cache');
  const pre = await worker.fetch(new Request(proxy(SEARCH), { method: 'OPTIONS', headers: { Origin: ORIGIN } }), {}, ctx);
  assert.equal(pre.status, 204);
  assert.match(pre.headers.get('Access-Control-Allow-Methods') ?? '', /POST/);
  assert.equal((await worker.fetch(new Request(proxy(page), { method: 'PUT' }), {}, ctx)).status, 405);
});
