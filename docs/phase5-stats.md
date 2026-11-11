# Phase 5: live statistics and player contributions (Game Center)

Files: `src/lib/gc-stats.mjs` (pure view-models), `src/lib/normalize.mjs` (`normalizeBoxscore(b, rail)`), `src/hooks/useGameBox.ts`, `src/components/gc/TeamStatsPane.tsx`, `PlayersPane.tsx`, `StatsBits.tsx`, `stats.css`. Tests: `tests/gc-stats.test.mjs`, `tests/browser/gc-stats.spec.ts`, fixture `tests/fixtures/boxscore-sample.json` (real NHL responses for game 2025030416, recorded 2026-11-10, untouched).

## What the NHL API really provides (verified with curl)
- `GET /v1/gamecenter/:id/boxscore`: per player lines (goals, assists, sog, hits, blockedShots, pim, plusMinus, toi, takeaways, giveaways, faceoffWinningPctg; goalies: saves, shotsAgainst, goalsAgainst, toi, starter) and only ONE team-level number: `homeTeam.sog` / `awayTeam.sog`. There is no `summary`, no `shotsByPeriod`, no team faceoff, power play, PIM, hits, blocks.
- `GET /v1/gamecenter/:id/right-rail`: `teamGameStats` (category rows with `awayValue`/`homeValue`: sog, faceoffWinningPctg, faceoffWins "33/63", powerPlay "0/3", powerPlayPctg, pim, hits, blockedShots, giveaways, takeaways), `shotsByPeriod`, `linescore.byPeriod`. These are the Official team numbers.

## Data shape (additive, nullable)
`normalizeBoxscore(boxscore, rail = null)` keeps every old field and adds `teams:{home,away}` (`sog, faceoffPct (0-100), faceoffWins, powerPlay{goals,opportunities,pct}, pim, hits, blocks, giveaways, takeaways`), `teamSource` (per field `official` | `derived`) and `periods[{number,type,goals{home,away},shots{home,away}}] | null`.
Without `rail`: `sog` stays Official; pim/hits/blocks/giveaways/takeaways are Derived (summed from player lines); power play, faceoffs and `periods` are null (the UI shows a dash, and derives the period table from play-by-play, labelled Derived).

### Lead must integrate (worker change, not made here)
`src/worker.js` `/api/boxscore/:id` currently calls `normalizeBoxscore(await get(".../boxscore"))`. To publish the Official team table, fetch right-rail in parallel and pass it as the second argument, tolerating its failure:
```js
const [box, rail] = await Promise.all([get(`/gamecenter/${id}/boxscore`), get(`/gamecenter/${id}/right-rail`).catch(() => null)]);
const data = normalizeBoxscore(box, rail);
```
Everything works without it (Derived fallbacks); with it the rows turn Official.

## Definitions
- Official: published by the NHL. Derived: counted by Iceboard from official data (team sums from player lines; goals/shots by period counted from play-by-play `goal` and `shot-on-goal`, shootout excluded). Each row/table carries its label.
- Points = goals + assists. Save % = saves / shots against (computed, `.917` style; shown "—" with no shots). A goalie with `00:00` and 0 shots against is excluded. Missing stats show "—", never 0.
- Notable performances: display filters on real stats, not a score. Skater: 3+ points ("3 points: 1G 2A"), hat trick (3+ goals), 6+ shots on goal. Goalie: 25+ saves, shutout on 15+ shots against, save % >= .950 on 15+ shots against (never flagged below 15 shots). Live games show at most 2 cards, finals at most 6. Limits: partial live numbers; thresholds are editorial; no strength-of-opponent or shot-quality adjustment.
- Two existing indexes, deliberately different and unchanged: the impact index (`model.mjs` `skaterImpact`/`goalieImpact`: goals + 0.7 assists + 0.1 shots + 0.25 plus/minus - 0.1 PIM; goalie saves - 0.9 x shots against) and the game score (`last-night.mjs` `gameScore`/`nightsOf`, which also weighs blocks, hits, takeaways, giveaways). Here skaters are ordered by game score (via `nightsOf`, no TOI floor) and goalies by `goalieImpact`; neither number is displayed.

## Refresh
`useGameBox` uses `useFeed('/api/boxscore/:id')`: 30 s while live; a non-live game keeps polling at 30 s only until the box reports OFF/FINAL, then one fetch and no timer; not started: no request. Both panes share one request/timer per game (`subscribeFeed`). Not `loadBox` (memoizes forever). A 404 or failure with no data shows "not published yet"; failure with data keeps the last numbers with an out-of-date warning.

## Mobile
At <= 520 px the skater table hides Hits, BLK, PIM and +/- columns and shows them in a second line under the name (sorting by those needs a wider screen). Tap targets are 44 px; no sideways scroll at 360 px.
