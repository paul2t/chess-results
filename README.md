# chess-results

A fast, phone-first viewer for team tournaments on [chess-results.com](https://chess-results.com).
Live site: **https://paul2t.github.io/chess-results/**

Built for the European Corporate Chess Championship 2026, but it works for any team tournament on
chess-results.com. Nothing is preselected: everybody picks their own tournaments and team.

## Dashboard, favorites, followed teams

The home page is a dashboard, not a fixed tournament:

* **Favorites** – tournaments you starred (☆/★). It opens on *Upcoming* (live ones first, then the soonest);
  finished tournaments are behind the *Past* tab, which only appears once you have some. They are stored in the browser (`localStorage`), on this device only.
* **Search** – type part of a name (or paste a chess-results link / tournament number) and press Search. It uses the
  [chess-results search](https://s2.chess-results.com/TurnierSuche.aspx?lan=1&SNode=S0) and lists team tournaments
  only (Swiss and round-robin team events), most recent first.
* **Followed teams** – tap ☆ on a team in Standings (or the ☆ at the top right of its card). They are kept per tournament, on this
  device only, and are **never part of the link**, so a link can be shared safely. Followed teams appear as chips at the top of the
  Team tab, one tap apart, and their games are outlined in Rounds. The Team tab opens on the first one you followed (or asks you to
  pick a team if there is none), and the ★ icon at the top right of Standings and Rounds ("followed only") keeps just them.
  Pages of the teams you opened last are remembered, so they still show when the wifi drops.
* **Back / Forward** – every tab or team change adds a history entry, and the address holds the whole position
  (`/<tournament>/<tab>/<team or round>`), so Back, reload and sharing a link land where you were.
  Coming back to the dashboard restores your last search, and tournaments you opened lately are listed under
  *Recently opened* (this device, up to 5 not already starred).

## Using it

| URL | What it shows |
| --- | --- |
| `/chess-results/` | The dashboard: favorites and tournament search |
| `/chess-results/1542962` | A tournament (`tnr` from the chess-results URL); opens on the Team tab |
| `/chess-results/1542962/team/50` | The page of team number 50 in that tournament |
| `/chess-results/1542962/standings` | The standings |
| `/chess-results/1542962/rounds/4` | Round 4 (`/rounds` alone: the latest round) |
| `/chess-results/demo/standings` | Full 2025 edition (real data, no network) to see what a finished event looks like; `demo` replaces the tournament number |

Links in the old form (`?t=1542962&view=team&show=50`, `?demo=1`) still work and are rewritten to the new form.
GitHub Pages has no server-side routing, so these paths are answered with `404.html` (a copy of `index.html`, made by
`build.mjs`); the page finds its files relative to the folder before the tournament number.

Tabs: **Team** (rank, match/game points, next or live match, line-up with per-round results, every match with
board-by-board colours, ratings and results), **Standings**, **Rounds** (all pairings, tap a team to open it). `‹`
goes back to the dashboard, where you pick (or paste a link to) another tournament; the ⚙ menu holds auto-refresh and the proxy.
The demo is on the dashboard's ⚙ menu.
Every tab ends with *Open on chess-results.com ↗*, the same page (team, standings, round) on the original site;
the ⚙ menu links the tournament's home page.
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
npm start           # build + serve on http://localhost:8080 (try /demo/team)
```

* `src/parse.ts` – parsers for the home/ranking, schedule, details, round-pairing and team pages
* `src/loader.ts` – loads a snapshot, reuses finished rounds to keep requests low
* `src/dashboard.ts` – home screen · `src/search.ts` – tournament search (form POST + result parser) · `src/favs.ts` – favorites logic · `src/dom.ts` – DOM/localStorage helpers
* `src/api.ts` – proxy chain, demo fetcher · `src/view.ts` – the UI · `src/i18n.ts` – EN/FR strings
* `demo-src/` – real 2025 data in compact form; `scripts/gen-demo.mjs` expands it into chess-results-shaped HTML

Deployment: every push to `main` runs typecheck + tests + build and publishes `dist/` with GitHub Actions
(Settings → Pages → Source must be **GitHub Actions**).

Pages are fetched with `lan=1` (English) because the parsers match English headings.
