# Phase 2 data notes: edge cases

## Schedule state
- `scheduleState` (NHL `gameScheduleState`: OK, PPD, CNCL, SUSP) is now merged from `/api/live` (`LIVE_FIELDS` in `game-data.mjs` also covers `start` and `date`, so a reschedule propagates).
- `isCalledOff(g)` / `isUpcoming(g)` (game-data.mjs) share one rule with `gameStatus().upcoming`. A called-off game is not upcoming. `playoffChances` (model.mjs) and `simulatePlayoffs` (playoff-sim.mjs) no longer count PPD/CNCL/SUSP games as remaining. Nothing else in their math changed. A postponed game that gets a new date and state OK counts again.
- Open point: a suspended game will resume; it is excluded from "remaining" while SUSP. If the NHL keeps `PPD` after setting a new date, the game stays excluded until the feed flips it back to OK.

## Live and stale
- ET midnight: a late West-coast game is still LIVE after the ET day rolls over. `game.date` stays the hockey day, so it remains in yesterday's list; "today" views must use the ET day, not a UTC or rolling window. `/score/now` returns the games around "now", so a game that finished a few minutes ago can disappear from it. The merge only updates games it still lists; the 5-minute `loadSeason` refresh picks up the final.
- Stale LIVE: more than 8 hours after puck drop (`STALE_LIVE_MS`, game-data.mjs; duplicated as a literal in worker.js). `useSeason().hasLive` ignores stale games, and `/api/season` no longer uses the 45 s refresh window because of one.
- Shootout labelling: `periodType === "SO"` shows "SO" with no clock; finals use `end` (`Final/OT`, `Final/SO`). Regular-season and playoff OT differ; the label does not distinguish them.
- PRE (preseason, type 1) games are never fetched or shown; only type 2 and 3 enter the season snapshot logic.

## Ordering
- Identical start times are common (a 7:00 pm ET slot has several games). Sorting by `start` alone depends on input order. `byStartThenId` (game-data.mjs) and the snapshot sort in worker.js now tie-break on `id`. Not mine to change: `useGameLists`, `Scoreboard`, `ticker.mjs` should sort with `byStartThenId`.

## Snapshot precedence and fallback
- `/api/season/{n}`: the KV copy and the static asset are compared by `updatedAt`; the newer wins, KV on a tie or when the asset has no stamp. Before this, KV always won even when the weekly refresh committed a newer static file. The background refresh trigger still looks only at the KV copy.
- `api.ts` records where each response came from (`sourceOf(path)`, `lastSeasonSource(season)`). `useSeason().source` is `"live"` or `"saved"` (saved means the API failed and `/data/seasons/*.json` was used).

## Polling
- `useFeed(url, interval)`: an interval of `0` or `Infinity` fetches once and sets no timer; when mixed with other subscribers the shortest finite interval wins. The `visibilitychange` re-poll now honours `SHARE_MS` (2 s), and "once" feeds that already hold data are not re-polled.

## Cron gaps
`wrangler.toml` crons: `0 9`, `30 11`, `30 15`, and `*/5 22-23,0-5` (UTC). That leaves 06:00-21:59 UTC (about 2 am to 5 pm ET) with no refresh. Weekday matinees (noon ET = 16:00 UTC), Saturday and Sunday afternoons (1 pm ET = 17:00 UTC) and early European/holiday games run unattended until a page load triggers the on-demand refresh (15 min window, or 45 s while live) or 22:00 UTC.

Proposal (not applied): add `*/5 16-21 * * *`. It is a trivial edit but each run does a full `refreshSeason` (32 club-schedule requests) plus league matchups, so it adds about 72 heavy runs a day; decide on the cost first. A cheaper variant is a light cron branch that only fetches `/score/now` and updates live games in KV.
