// Network layer. chess-results.com sends no CORS headers, so a browser page on github.io cannot
// read it directly: requests go through a CORS proxy (see worker/ and README). Order tried:
//   1. proxies from ?proxy= / localStorage / config.json (templates containing "{url}")
//   2. a direct request (works only if the page is served from chess-results itself or CORS is lifted)
// The first source that works is remembered for the rest of the session.

export type Params = Record<string, string | number>;

export interface Fetcher {
  /** Returns the HTML for a chess-results page of tournament `tnr`. */
  get(tnr: number, params: Params): Promise<string>;
  /** Fetches any chess-results URL; with `form` (urlencoded) it is a POST, used by the tournament search. */
  raw(url: string, form?: string): Promise<string>;
  /** Human readable description of the source that served the last request. */
  source(): string;
}

const ORIGIN = 'https://chess-results.com';

export function pageUrl(tnr: number, params: Params): string {
  const q = new URLSearchParams({ lan: '1' });
  for (const [k, v] of Object.entries(params)) q.set(k, String(v));
  return `${ORIGIN}/tnr${tnr}.aspx?${q.toString()}`;
}

async function fetchText(url: string, timeoutMs: number, form?: string): Promise<string> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const init: RequestInit = { signal: ctl.signal, cache: 'no-store' };
    if (form !== undefined) {
      init.method = 'POST';
      init.body = form;
      init.headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
    }
    const res = await fetch(url, init);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    if (!text || text.length < 200) throw new Error('empty response');
    return text;
  } finally {
    clearTimeout(timer);
  }
}

export function createFetcher(proxies: string[]): Fetcher {
  const sources: { label: string; build: (u: string) => string }[] = [
    ...proxies.filter(Boolean).map((tpl) => ({
      label: new URL(tpl.replace('{url}', 'x'), location.href).host,
      build: (u: string) => tpl.replace('{url}', encodeURIComponent(u)),
    })),
    { label: 'direct', build: (u: string) => u },
  ];
  let good = 0;
  let last = sources[0]!.label;

  async function raw(target: string, form?: string): Promise<string> {
    const order = [good, ...sources.map((_, i) => i).filter((i) => i !== good)];
    let lastErr: unknown;
    for (const i of order) {
      const s = sources[i]!;
      try {
        const html = await fetchText(s.build(target), 15000, form);
        good = i;
        last = s.label;
        return html;
      } catch (e) {
        lastErr = e;
      }
    }
    throw new Error(`Cannot reach chess-results (${lastErr instanceof Error ? lastErr.message : lastErr})`);
  }

  return {
    source: () => last,
    raw,
    get: (tnr, params) => raw(pageUrl(tnr, params)),
  };
}

/** Serves the pages generated from the 2025 edition (public/demo) instead of the network. */
export function createDemoFetcher(): Fetcher {
  return {
    source: () => 'demo',
    raw: () => Promise.reject(new Error('Search is not available in the demo')),
    async get(_tnr, p) {
      let file: string;
      if (p.art === 14) file = 'schedule.html';
      else if (p.art === 2) file = `round-${p.rd}.html`;
      else if (p.art === 20 || p.art === 8) file = `team-${p.snr}.html`;
      else if (p.turdet === 'YES') file = 'none.html';
      else file = 'home.html';
      const res = await fetch(`demo/${file}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.text();
    },
  };
}
