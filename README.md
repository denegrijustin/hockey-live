# Iceboard — NHL game intelligence

Responsive replacement for `hockey-pipeline`, deployed at https://nhl.elskatemm.com/ from this repository's `main` branch.

Defaults to Edmonton, Chicago and Minnesota. All 32 teams are selectable, with preferences saved on the device. Includes a game center, separate past/future importance rankings, recent-form charts, live game graphs, NHL EDGE comparisons, actual game player contributions, season player comparisons, rolling team trends, standings, and NHL broadcast listings. Desktop uses a dense card grid; mobile uses single-column cards, sticky team/view controls and expandable details.

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

The existing daily 09:00 UTC Worker cron refreshes the current season in KV. Requests for a current-season snapshot older than 15 minutes return the last good snapshot and trigger a background refresh. Refresh the page again after it completes. A failed refresh preserves the previous data. Player summaries cache for six hours. Live scoreboard, game details and box scores use 15-second edge caches; completed game details use one-hour caches. Snapshot timestamps are visible, and the app falls back to packaged JSON if API calls fail.

Endpoints: `GET /api/season/{season}`, `/api/players/{season}/{team}`, `/api/boxscore/{gameId}`, `/api/live`, `/api/game/{gameId}`, `/api/edge/{season}/{team}`. Original `/api/team-stats` continues serving available legacy KV snapshots; it is deprecated and is no longer refreshed.

## Interpretation

Importance is an editorial 0–100 index, not calibrated playoff probability: 22 baseline + 12 same conference + 12 same division + up to 26 for season-calendar progress + up to 28 for proximity to the points entry line after 10 games. Playoffs use round and series-elimination context. Preseason is unranked. Schedule length comes from the data (including 84-game seasons).

Past importance uses standings before the game day; future importance uses current standings and the target game's calendar position. Ranks are league-wide within past/future and competition cohorts, with shared ranks for equal scores. Future standings are not simulated. Past rankings are reconstructed from the latest schedule, not archived predictions.

The scenario controls have been removed from cards in favor of recent form and game evidence. Standings remain points-based references, without full official tiebreaker or playoff-probability modeling.

Skater impact = goals + 0.7×assists + 0.1×shots + 0.25×plus/minus − 0.1×penalty minutes. Goalies use saves minus 90% of shots faced, a fixed .900 benchmark. These are box-score indexes, not WAR, expected goals, causal impact or a reproduction of HockeyStats' proprietary model. Upcoming players show historical season context, not projected lineups. Before current-season regular results exist, player context uses the previous season and is labeled accordingly; traded players may appear for multiple team stints.

## Deployment

Cloudflare Workers Builds already connects `denegrijustin/hockey-live`, branch `main`. Build command: `npm run build`. Deploy command: `npx wrangler deploy`. The checked-in pnpm lockfile determines dependency installation; npm can invoke the same build script. `wrangler.toml` preserves the existing Worker name, TEAM_STATS KV binding and daily cron, and serves `dist` with SPA fallback. `/api/*` runs the Worker first. No credentials are committed.

For an authenticated local CLI, `pnpm deploy` builds and deploys. Otherwise push `main` through the signed-in GitHub Desktop app and inspect the Cloudflare build. Roll back to a prior version through Cloudflare Deployments if necessary.

Data and logos originate from NHL public feeds. This is an independent dashboard with original presentation, not affiliated with NHL or HockeyStats. No paid HockeyStats data is copied.

## Live games and NHL EDGE

The scoreboard checks `/score/now` every 30 seconds while the tab is visible, even before a game starts. It merges scores, period, clock and shots into the loaded season without clearing the UI. Live games sort first. The league-wide live strip can select any live matchup; favorites remain available through My three. The clock is the NHL feed clock, never a fabricated ticking clock. Live data can be delayed upstream. If updates fail, the last response remains visible with an error.

Visible live cards check play-by-play every 30 seconds. Cumulative shots on goal, hits, blocks, shot maps and scoring are normalized in `src/lib/game-data.mjs`. Shootout attempts are excluded from shot charts; rink coordinates are displayed as recorded (teams switch ends). Expanded live player contributions refresh separately. Polling pauses in background tabs and outside the viewport. The regular season snapshot refreshes in the background every two minutes without collapsing cards.

EDGE charts use NHL team-detail data, including top skating speed, 20+ mph bursts, shot speed, skating distance, zone-time percentages and shot-location groups. The NHL supplies team ranks and league averages. This is published season tracking data, not live player coordinates. When the requested season is unavailable, the previous season is explicitly labeled. `pnpm refresh:edge` refreshes fallback snapshots for all 32 teams; EDGE API responses cache for six hours. The tracked source season and retrieval time are displayed.

Tests include recorded NHL fixtures and simulated polling, failed updates, zero-score preservation and LIVE→OFF transitions. They do not depend on a live NHL game being in progress.

### Winner and score projections
Upcoming regular-season/playoff cards show the most likely final score and an estimated winner. Live cards update win estimates with the scoreboard, regulation clock and shot pressure. `src/lib/projection.mjs` contains the model; `Projection.tsx` contains its presentation. Season GF/GA are shrunk toward 20 games of prior-season history (itself shrunk toward 3 goals per team); a bounded last-five form adjustment and 0.12-goal home adjustment modify rates. Independent Poisson goal distributions allocate tied outcomes to an estimated OT/shootout winner. Live remaining rates scale by regulation time, with shot adjustments capped at 25%. Intermission clocks are not mistaken for playing time. OT uses a next-goal strength share; shootouts, missing clocks, finals and preseason do not display forecasts. Prior-season context is passed only when older than the game season.

These are uncalibrated model estimates, not measured prediction accuracy or betting odds. They do not account for lineups, goalies, power plays or empty nets. Live feeds can lag. Pregame estimates refresh as history changes and are not stored historical forecasts. The displayed most likely score may favor a different team than the aggregate win probability.

Live projections now use a coherent play-by-play snapshot and its confirmed power-play strength/time. Attacking rates rise by 170% for a one-skater advantage (240% for two), short-handed rates fall 35%, and only the remaining advantage interval receives this heuristic adjustment. Named penalty events are retained, but coincidental penalties are not assumed to create an advantage. The card explains score/time, shot pressure and strength, and records percentage-point movement since the last observed snapshot with newly received goals/penalties/shots. Multiple plays and clock changes can arrive in one poll: movement is not presented as the isolated causal effect of a single play. Tracking begins when the card loads; it is not a persistent historical probability log. NHL play-by-play does not confirm player injury status; injury adjustments are explicitly unavailable, never inferred from absence or hits.
