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
- `public/data/league-matchups/`: league-wide team and goalie comparison snapshots.
- `public/logos/`: local official NHL team logo assets.
- `public/network-logos/`: local broadcaster logo assets used on compact game cards.

`pnpm refresh:data` discovers the current season, imports it and the previous season, refreshes team player data, recent box scores, and league-wide matchup snapshots, then updates the manifest. `pnpm refresh:matchups` refreshes only the official NHL team and goalie reports. Commit refreshed snapshots. The importer throttles requests and retries rate limits. Refresh snapshots when the season changes; the deployed manifest determines supported seasons.

The existing daily 09:00 UTC Worker cron refreshes the current season and league matchup data in KV. Requests for a current-season snapshot older than 15 minutes return the last good snapshot and trigger a background refresh. Refresh the page again after it completes. A failed refresh preserves the previous data. Player summaries cache for five minutes. Live scoreboard, game details and box scores use 15-second edge caches; completed game details use one-hour caches. Snapshot timestamps are visible, and the app falls back to packaged JSON if API calls fail.

Endpoints: `GET /api/season/{season}`, `/api/league-matchups/{season}`, `/api/players/{season}/{team}`, `/api/boxscore/{gameId}`, `/api/live`, `/api/game/{gameId}`, `/api/edge/{season}/{team}`. Add `?refresh=1` to the season or league-matchup endpoint for a bounded manual refresh. Original `/api/team-stats` continues serving available legacy KV snapshots; it is deprecated and is no longer refreshed.

## Interpretation

Importance is a 0–100 stakes index, not watchability or calibrated playoff probability. Team importance combines season-calendar progress with the strongest club-level pressure near a conference playoff entry line. League importance combines conference/division race overlap, calendar progress, and the shared playoff-line pressure both clubs bring. Overall importance weights team stakes 60% and league stakes 40%. Playoffs use round and series-elimination context. Preseason is unranked. Schedule length comes from the data (including 84-game seasons).

Past importance uses standings before the game day; future importance uses current standings and the target game's calendar position. Ranks are league-wide within past/future and competition cohorts, with shared ranks for equal scores. Future standings are not simulated. Past rankings are reconstructed from the latest schedule, not archived predictions.

The scenario controls have been removed from cards in favor of recent form and game evidence. Standings remain points-based references without the NHL's full official tiebreak procedure. The separate playoff-likelihood model is a transparent projected-points heuristic, not an official or calibrated probability.

Skater impact = goals + 0.7×assists + 0.1×shots + 0.25×plus/minus − 0.1×penalty minutes. Goalies use saves minus 90% of shots faced, a fixed .900 benchmark. These are box-score indexes, not WAR, expected goals, causal impact or a reproduction of HockeyStats' proprietary model. Upcoming players show historical season context, not projected lineups. Player context always uses the selected season; unpublished stats remain empty. Traded players may appear for multiple team stints.

## Deployment

Cloudflare Workers Builds already connects `denegrijustin/hockey-live`, branch `main`. Build command: `npm run build`. Deploy command: `npx wrangler deploy`. The checked-in pnpm lockfile determines dependency installation; npm can invoke the same build script. `wrangler.toml` preserves the existing Worker name, TEAM_STATS KV binding and daily cron, and serves `dist` with SPA fallback. `/api/*` runs the Worker first. No credentials are committed.

For an authenticated local CLI, `pnpm deploy` builds and deploys. Otherwise push `main` through the signed-in GitHub Desktop app and inspect the Cloudflare build. Roll back to a prior version through Cloudflare Deployments if necessary.

Data and logos originate from NHL public feeds. This is an independent dashboard with original presentation, not affiliated with NHL or HockeyStats. No paid HockeyStats data is copied.

## Live games and NHL EDGE

The scoreboard checks `/score/now` every 30 seconds while the tab is visible, even before a game starts. It merges scores, period, clock and shots into the loaded season without clearing the UI. Live games sort first. The league-wide live strip can select any live matchup; favorites remain available through My three. The clock is the NHL feed clock, never a fabricated ticking clock. Live data can be delayed upstream. If updates fail, the last response remains visible with an error.

Visible live cards check play-by-play every 30 seconds. Cumulative shots on goal, hits, blocks, shot maps and scoring are normalized in `src/lib/game-data.mjs`. Shootout attempts are excluded from shot charts; rink coordinates are displayed as recorded (teams switch ends). Expanded live player contributions refresh separately. Polling pauses in background tabs and outside the viewport. The regular season snapshot refreshes in the background every two minutes without collapsing cards.

EDGE charts use NHL team-detail data, including top skating speed, 20+ mph bursts, shot speed, skating distance, zone-time percentages and shot-location groups. The NHL supplies team ranks and league averages. This is published season tracking data, not live player coordinates. When the requested season is unavailable, charts show clearly labeled previous-season totals. Visible panels recheck every five minutes and switch to the requested season when published. `pnpm refresh:edge` refreshes selected-season snapshots for all 32 teams; EDGE API responses cache for five minutes and visible panels retry every five minutes. The tracked source season and retrieval time are displayed.

Tests include recorded NHL fixtures and simulated polling, failed updates, zero-score preservation and LIVE→OFF transitions. They do not depend on a live NHL game being in progress.

### Winner and score projections
Upcoming regular-season/playoff cards show the most likely final score and an estimated winner. Live cards update win estimates with the scoreboard, regulation clock and shot pressure. `src/lib/projection.mjs` contains the model; `Projection.tsx` contains its presentation. Season GF/GA are shrunk toward 20 games of prior-season history (itself shrunk toward 3 goals per team); a bounded last-five form adjustment and 0.12-goal home adjustment modify rates. Independent Poisson goal distributions allocate tied outcomes to an estimated OT/shootout winner. Live remaining rates scale by regulation time, with shot adjustments capped at 25%. Intermission clocks are not mistaken for playing time. OT uses a next-goal strength share; shootouts, missing clocks, finals and preseason do not display forecasts. Prior-season context is passed only when older than the game season.

These are uncalibrated model estimates, not measured prediction accuracy or betting odds. They do not account for lineups, goalies, power plays or empty nets. Live feeds can lag. Pregame estimates refresh as history changes and are not stored historical forecasts. The displayed most likely score may favor a different team than the aggregate win probability.

Live projections now use a coherent play-by-play snapshot and its confirmed power-play strength/time. Attacking rates rise by 170% for a one-skater advantage (240% for two), short-handed rates fall 35%, and only the remaining advantage interval receives this heuristic adjustment. Named penalty events are retained, but coincidental penalties are not assumed to create an advantage. The card explains score/time, shot pressure and strength, and records percentage-point movement since the last observed snapshot with newly received goals/penalties/shots. Multiple plays and clock changes can arrive in one poll: movement is not presented as the isolated causal effect of a single play. Tracking begins when the card loads; it is not a persistent historical probability log. NHL play-by-play does not confirm player injury status; injury adjustments are explicitly unavailable, never inferred from absence or hits.


### Player profiles and standings
Player contributions display NHL headshots and jersey numbers from game box scores or season rosters; missing numbers remain marked unavailable. Click a name for an accessible dialog with profile details and selected-season NHL statistics, plus a full NHL profile link. Current profile team/number is labeled separately from historical team stints. Players refresh every five minutes and default to a one-game minimum.

Standings switch between current points and projected final points, grouped by league, conference or division. Forecasts use remaining regular-season schedule counts and points pace shrunk toward 20 prior-season games (55% points percentage if prior history is unavailable); they are not official tiebreak rankings. Finished seasons project to actual points. Team Trends includes a full-season playoff-likelihood line. The heuristic compares projected points with the conference entry line and reduces uncertainty as the schedule advances. Live games replace their generic pace value with expected standings points from the live win estimate, so the trend and compact-card percentages can move with goals and other live inputs. These are uncalibrated estimates, not official NHL probabilities or betting odds. Game cards use dark home-team color tints independently of chart accent colors.

Players has its own team selection, starting with EDM/CHI/MIN each page load, independent of the game board. Any team combination or All 32 is available from the shared picker. Live cards also display the most likely final score (including an OT winner). Hits appear separately in contribution rows and tables without changing the index formula. Game hits come from box scores; season hits come from the NHL realtime skater report matched to team, season, player and games played. Unavailable or mismatched reports show a dash, never a fabricated zero.

### Game pulse and ice tilt
Live cards show a minimal full-game flow strip, and Game Center provides the detailed hover, tap and keyboard-slider view. The fixed timeline marks the start, 20, 40 and 60 minutes (plus overtime when needed); its line ends at the latest received game time and fills toward the end as play advances. Game flow means recent momentum: goals, shots on goal, missed shots, hits and penalties are weighted in a rolling five-minute window, then fade as they age. Positive values favor the home team and negative values favor the away team. It is an explanatory activity index, not possession or a win prediction.

Game Center also displays separate cumulative shots-on-goal and hit timelines using matching time scales and team colors. Lines end at the reported game clock. Ice tilt is explicitly a shot-pressure proxy: each team's share of unblocked attempts (shots on goal including goals, plus misses) in the last ten playing minutes, at all strengths. Blocked shots are excluded because their event owner may be the defending team. Zero attempts show no estimate, not a fabricated 50/50 possession split. This is not measured zone possession or live NHL EDGE tracking; older saved snapshots without full plays show an unavailable message.

Game cards start with the exact date/status, broadcaster logos, venue, matchup, records, playoff chances and overall importance score, with separate team and league stakes shown beneath it. The compact **GC** button opens Game Center directly. Selecting the card reveals a concise first level with a Game Center button, why-it-matters summary, projection and goalie/lineup brief. Detailed comparisons, live game data, player analysis, history and model explanations live in Game Center. Clicking outside an expanded card collapses it; opening Game Center keeps the card state stable.

Published TV/streaming assignments use local broadcaster marks in the top-right badge, replacing the league-wide T# rank badge. Duplicate regional aliases from the same network brand collapse to one mark, up to three brands appear on the card, and the accessible label and expanded details retain the complete feed list. Unknown local stations use a short fallback label; unannounced assignments display `TV TBD`.

## Ranks
Every game card shows each team's division, conference and league rank under its record, e.g. `ATL #2 · East #4 · #9 overall · by points %` (hover for the long form). `src/lib/ranks.mjs` (`teamRanks`, `rankLine`, `rankTitle`) ranks by points percentage (points ÷ 2·GP, so games in hand are comparable), then points, regulation wins and goal differential; teams share a rank only when all four tie. Past games use the standings before that game day (the `before` table the card already receives); upcoming games use current standings. Before any game is played (e.g. preseason) no ranks are shown. The importance score is unchanged. Like the rest of the app this is not the NHL's full official tiebreak procedure.

## Matchup comparison
Game Center uses `src/components/TeamComparison.tsx` and the typed `LeagueMatchupSnapshot` contract to compare each team's offense with its opponent's defense. Official NHL league reports supply goals and shots per game, power play and penalty kill rates, shooting percentage, save percentage, and goalie summaries. Rankings use unrounded values across the complete eligible pool with competition ranks for exact ties. Badges mark league-best, top/bottom 5 and top/bottom 10 boundaries; a rank gap over five places points toward the stronger side and smaller gaps remain neutral. These are rank comparisons, not game predictions.

Starting-goalie status is confirmed only when a game box score identifies the starter. Before that, the dashboard labels the team leader in season starts as projected; missing reports remain unknown. The public NHL feeds used here do not reliably publish pregame injuries, line combinations, or a formal starter confirmation feed, so those fields are never inferred. Browser caching covers official player photos, while team and broadcaster marks remain local assets.

## ESPN links
When a game is broadcast on ESPN, ESPN+, ESPN2, ESPNU or ABC, that channel logo links (new tab, `rel="noopener noreferrer"`, never expanding the card) to the game on ESPN, which opens the ESPN app on phones that have it (universal link). ESPN publishes no public link that starts a given stream, so this opens the game page, not playback. ESPN's event id differs from the NHL id: `GET /api/espn/{YYYYMMDD}` in the Worker reads ESPN's public scoreboard and returns `{ date, games: { "AWAY-HOME": "<espn id>" } }` using NHL abbreviations (ESPN's `NJ`/`SJ`/`TB`/`LA`/`UTAH` are mapped explicitly, with a team-name fallback), cached for 60 s today and one hour otherwise; upstream failure returns `{ games: {} }`. The client (`src/lib/espn-links.mjs`, `useEspnGame.ts`) fetches lazily once per date for visible cards and falls back to the ESPN schedule page for that date if the game is not found. The ESPN lookup could not be tested against the live ESPN site from the build sandbox; parsing is verified only against a hand-written fixture (`tests/fixtures/espn-scoreboard.json`) shaped like ESPN's scoreboard JSON.


### Playoff odds
The **Playoff odds** tab plays out every unfinished regular-season game 20,000 times (`src/lib/playoff-sim.mjs`) and shows a grid per conference: division 1st/2nd/3rd, the two wild cards, making the playoffs, the #1 seed in the conference and the Presidents' Trophy. Team strength is goals for and against per game shrunk toward the prior season and the league average (the same idea as the game projections), with a small home edge, independent Poisson goals and a regulation-tie going to overtime or a shootout (the winner gets 2 points, the loser 1). The field is the NHL's: top three in each division plus two wild cards per conference. Ties in points go to regulation wins and then a coin flip, so the full NHL tiebreak procedure is not implemented. These are uncalibrated model estimates, not official odds. The game cards' "% playoffs" come from the same simulation (5,000 runs, rerun when a game finishes), so the cards and the tab agree. A finished season shows its actual final field.

### Imperialism map
The **Imperialism map** tab (`src/components/ImperialismMap.tsx`, engine in `src/lib/imperialism.mjs`) plays the season as a land grab over the United States and Canada south of about 56°N (Alaska, Hawaii and the far north are left out). About 2,600 sample points on land (`public/data/imperialism/cells.json`, built by `scripts/build-imperialism-geo.mjs` from the `world-atlas` and `us-atlas` shapes) start with the team whose home arena (`src/lib/arenas.json`) is nearest, a Voronoi split. Every finished regular-season and playoff game then runs in start-time order: the loser's whole land goes to the winner, a landless loser transfers nothing, and a landless winner re-enters by beating a team that holds land. Overtime and shootout wins count. The Full NHL map uses all 32 teams; East and West are separate maps among that conference's arenas, counting only games within it. A week slider replays the season, region cards show the home team, the current ruler and the conquest path, and the map can show team logos and a faint logo texture. Because the loser always loses everything, a full season usually ends with one empire; the slider is where the story is. The map fits the screen (never taller than 70% of the viewport at 1x, so the page scrolls past it), the standings sit beside it on wide screens, and only a zoomed map scrolls inside its own box. The map runs in the browser from the season data the app already loads. Shared arenas and sampling mean a few teams (for example the Islanders and Devils) can start with no land.
