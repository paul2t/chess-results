# chess-results

A fast, phone-first viewer for team tournaments on [chess-results.com](https://chess-results.com).
Live site: **https://paul2t.github.io/chess-results/**

Built for the European Corporate Chess Championship 2026 (team *Dassault Systemes 1*), but it works for
any team tournament on chess-results.com.

## Dashboard, favorites, my team

The home page is a dashboard, not a fixed tournament:

* **Favorites** – tournaments you starred (☆/★), live ones first, then upcoming, then finished. A favorite also
  shows which team is yours in it. They are stored in the browser (`localStorage`), on this device only.
* **Search** – type part of a name (or paste a chess-results link / tournament number) and press Search. It uses the
  [chess-results search](https://s2.chess-results.com/TurnierSuche.aspx?lan=1&SNode=S0) and lists team tournaments
  only (Swiss and round-robin team events), most recent first.
* **My team** – open a tournament, open any team (Standings or Rounds) and tap *Set as my team*. It is remembered per
  tournament and opened first next time. The team you leave stays as a followed team.
* **Followed teams** – tap ☆ on a team in Standings (or *Follow this team* on its page). Followed teams appear as
  chips at the top of the Team tab, one tap from your own, and their games are outlined in Rounds.

## Using it

| URL | What it shows |
| --- | --- |
| `/chess-results/` | The dashboard: favorites and tournament search |
| `?t=1542962&team=50` | A tournament (`tnr` from the chess-results URL) and team (number **or** name) |
| `?view=standings` / `rounds` / `team` | Open on a given tab |
| `?demo=1` | Full 2025 edition (real data, no network) to see what a finished event looks like |

Tabs: **Team** (rank, match/game points, next or live match, line-up with per-round results, every match with
board-by-board colours and results), **Standings**, **Rounds** (all pairings, tap a team to open it). The
⚙ menu takes a chess-results link and the tournament switches; `‹` goes back to the dashboard.
Tapping a team anywhere opens its page. The page refreshes on load, with the ↻ button, and every 60 s while
visible; the last data is cached so it still shows something when the venue wifi drops.

## The one thing you must set up: the proxy

chess-results.com sends no CORS headers, so a page on github.io cannot read it directly (verified).
`worker/proxy.js` is a ~60-line Cloudflare Worker that fetches `*.chess-results.com` pages for the viewer. It only
proxies chess-results, only answers `https://paul2t.github.io`, and caches each page for 20 s. It also accepts a `POST`
to the tournament search page (`TurnierSuche.aspx`, never cached) and nothing else; the dashboard search needs that.
**After updating the repo, redeploy the worker** (`npx wrangler deploy`) or search will say the proxy is outdated.

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
* `src/dashboard.ts` – home screen · `src/search.ts` – tournament search (form POST + result parser) · `src/favs.ts` – favorites logic · `src/dom.ts` – DOM/localStorage helpers
* `src/api.ts` – proxy chain, demo fetcher · `src/view.ts` – the UI · `src/i18n.ts` – EN/FR strings
* `demo-src/` – real 2025 data in compact form; `scripts/gen-demo.mjs` expands it into chess-results-shaped HTML

Deployment: every push to `main` runs typecheck + tests + build and publishes `dist/` with GitHub Actions
(Settings → Pages → Source must be **GitHub Actions**).

Pages are fetched with `lan=1` (English) because the parsers match English headings.
