# Iceboard — NHL game intelligence

Responsive replacement for `hockey-pipeline`, deployed at https://hockey-pipeline.denegri-justin.workers.dev/ from this repository's `main` branch.

Defaults to Edmonton, Chicago and Minnesota. All 32 teams are selectable, with preferences saved on the device. Includes a game center, separate past/future importance rankings, regulation win/loss and overtime-loss scenarios, actual game player contributions, season player comparisons, rolling team trends, standings, and NHL broadcast listings. Desktop uses a dense card grid; mobile uses single-column cards, sticky team/view controls and expandable details.

## Run and validate

Node 24 and pnpm 11 are recommended (version pinned in package.json).

```sh
pnpm install --frozen-lockfile
pnpm dev                  # UI with packaged JSON fallbacks
pnpm test                 # model and data integrity
pnpm build                # TypeScript and production bundle
pnpm exec playwright install chromium
pnpm test:browser         # desktop and mobile integration tests
pnpm dev:worker           # built UI + real Worker API, local KV, port 8788
```

Run `pnpm build` before `dev:worker`; rebuild/reload after changes. Vite alone uses checked-in player/game snapshots; older box scores require the Worker API. No NHL credentials are needed.

## Data and refresh

- `src/components/`: React views and reusable cards.
- `src/lib/model.mjs`: standings reconstruction, scenarios and auditable rating formulas.
- `src/lib/normalize.mjs`: public NHL feed normalization.
- `src/worker.js`: same-origin API, background refresh and KV caching.
- `public/data/manifest.json`: supported seasons and default season.
- `public/data/seasons/`: deduplicated schedules and results for all teams.
- `public/data/players/`: regular-season team-stint player statistics.
- `public/data/games/`: selected recent completed box scores for offline fallback.
- `public/logos/`: local official NHL team logo assets.

`pnpm refresh:data` discovers the current season, imports it and the previous season, refreshes team player data and recent box scores, and updates the manifest. Commit refreshed snapshots. The importer throttles requests and retries rate limits. Refresh snapshots when the season changes; the deployed manifest determines supported seasons.

The existing daily 09:00 UTC Worker cron refreshes the current season in KV. Requests for a current-season snapshot older than 15 minutes return the last good snapshot and trigger a background refresh. Refresh the page again after it completes. A failed refresh preserves the previous data. Player data caches for six hours; completed box scores cache for 14 days. Snapshot timestamps are visible, and the app falls back to packaged JSON if API calls fail.

Endpoints: `GET /api/season/{season}`, `/api/players/{season}/{team}`, `/api/boxscore/{gameId}`. Original `/api/team-stats` continues serving available legacy KV snapshots; it is deprecated and is no longer refreshed.

## Interpretation

Importance is an editorial 0–100 index, not calibrated playoff probability: 22 baseline + 12 same conference + 12 same division + up to 26 for season-calendar progress + up to 28 for proximity to the points entry line after 10 games. Playoffs use round and series-elimination context. Preseason is unranked. Schedule length comes from the data (including 84-game seasons).

Past importance uses standings before the game day; future importance uses current standings and the target game's calendar position. Ranks are league-wide within past/future and competition cohorts, with shared ranks for equal scores. Future standings are not simulated. Past rankings are reconstructed from the latest schedule, not archived predictions.

Scenarios isolate one result and freeze other games. Conference ranks use points only and share ties. The entry line is a descriptive points reference using division third place / second wild card; it does not model all official tiebreakers, games in hand, clinching, elimination or playoff odds.

Skater impact = goals + 0.7×assists + 0.1×shots + 0.25×plus/minus − 0.1×penalty minutes. Goalies use saves minus 90% of shots faced, a fixed .900 benchmark. These are box-score indexes, not WAR, expected goals, causal impact or a reproduction of HockeyStats' proprietary model. Upcoming players show historical season context, not projected lineups. Before current-season regular results exist, player context uses the previous season and is labeled accordingly; traded players may appear for multiple team stints.

## Deployment

Cloudflare Workers Builds already connects `denegrijustin/hockey-live`, branch `main`. Build command: `npm run build`. Deploy command: `npx wrangler deploy`. The checked-in pnpm lockfile determines dependency installation; npm can invoke the same build script. `wrangler.toml` preserves the existing Worker name, TEAM_STATS KV binding and daily cron, and serves `dist` with SPA fallback. `/api/*` runs the Worker first. No credentials are committed.

For an authenticated local CLI, `pnpm deploy` builds and deploys. Otherwise push `main` through the signed-in GitHub Desktop app and inspect the Cloudflare build. Roll back to a prior version through Cloudflare Deployments if necessary.

Data and logos originate from NHL public feeds. This is an independent dashboard with original presentation, not affiliated with NHL or HockeyStats. No paid HockeyStats data is copied.
