# chess-results

A fast, phone-first viewer for team tournaments on [chess-results.com](https://chess-results.com).
Live site: **https://paul2t.github.io/chess-results/**

Built for the European Corporate Chess Championship 2026 (team *Dassault Systemes 1*), but it works for
any team tournament on chess-results.com.

## Using it

| URL | What it shows |
| --- | --- |
| `/chess-results/` | Default tournament and team (set in `public/config.json`) |
| `?t=1285835&team=45` | Another tournament (`tnr` from the chess-results URL) and team (number **or** name) |
| `?view=standings` / `rounds` / `team` | Open on a given tab |
| `?demo=1` | Full 2025 edition (real data, no network) to see what a finished event looks like |

Tabs: **Team** (rank, match/game points, next or live match, line-up with per-round results, every match with
board-by-board colours and results), **Standings**, **Rounds** (all pairings, tap a team to open it). The
⚙ menu takes a chess-results link and the tournament switches; the chosen team is remembered per tournament.
Tapping a team anywhere opens its page. The page refreshes on load, with the ↻ button, and every 60 s while
visible; the last data is cached so it still shows something when the venue wifi drops.

## The one thing you must set up: the proxy

chess-results.com sends no CORS headers, so a page on github.io cannot read it directly (verified).
`worker/proxy.js` is a ~60-line Cloudflare Worker that fetches `*.chess-results.com` pages for the viewer. It only
proxies chess-results, only answers `https://paul2t.github.io`, and caches each page for 20 s.

```bash
cd worker
npx wrangler login
npx wrangler deploy          # prints https://chess-results-proxy.<you>.workers.dev
```

Then give the viewer the URL, either way:

* once, from the phone: ⚙ → *Proxy URL* → `https://chess-results-proxy.<you>.workers.dev/?url={url}`
  (stored in the browser), or
* for everyone: put it in `public/config.json` → `"proxies": ["https://…/?url={url}"]` and push.

Public CORS proxies (corsproxy.io, allorigins) were tried and are not usable.

## Develop

```bash
npm install
npm test            # parser tests (jsdom) against fixtures built from real 2025/2026 pages
npm run typecheck
npm run build       # -> dist/ (view.js bundled from src/view.ts with esbuild)
npm start           # build + serve on http://localhost:8080 (try /?demo=1)
```

* `src/parse.ts` – parsers for the home/ranking, schedule, details, round-pairing and team pages
* `src/loader.ts` – loads a snapshot, reuses finished rounds to keep requests low
* `src/api.ts` – proxy chain, demo fetcher · `src/view.ts` – the UI · `src/i18n.ts` – EN/FR strings
* `demo-src/` – real 2025 data in compact form; `scripts/gen-demo.mjs` expands it into chess-results-shaped HTML

Deployment: every push to `main` runs typecheck + tests + build and publishes `dist/` with GitHub Actions
(Settings → Pages → Source must be **GitHub Actions**).

Pages are fetched with `lan=1` (English) because the parsers match English headings.
