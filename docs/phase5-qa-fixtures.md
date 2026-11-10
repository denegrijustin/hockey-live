# Phase 5 QA fixtures: what is real, what is derived

Rule: no invented game data. Every sequence is a real NHL response, with the mutation (if any) stated and recorded in `raw._provenance`.

## Real recorded data (`tests/fixtures/gc/`)

| File | Source | What it is |
| --- | --- | --- |
| `../raw-live-game.json` | repo fixture (real `/gamecenter/<id>/play-by-play`, 2026020001, CAR v FLA, in progress, 114 plays) | Live envelope, first-period plays, **zero goals**, has `situationCode`, hits, penalty, clock in intermission |
| `real-reg.json` | `https://api-web.nhle.com/v1/gamecenter/2025021312/play-by-play` (SEA at COL, 2026-04-16, final in regulation, 0-2, 307 plays) | Real completed REG game, 2 goals |
| `real-ot.json` | `.../2025021300/play-by-play` (LAK at VAN, 2026-04-14, 3-4 final in OT, 307 plays) | Real OT game: 7 goals with assists and score-after, OT goal ends it |
| `real-so.json` | `.../2025021301/play-by-play` (DAL at BUF, 2026-04-15, 4-3 final in SO, 312 plays) | Real shootout game: SO "goal" events (periodType SO, score frozen at 3-3) |

`tests/fixtures/gc/trim.mjs` re-fetches these three files. The trim only removes highlight-clip ids/URLs, replay URLs, logos and radio links; every other field is the API response verbatim. Fetched 2026-11-10 (public, unauthenticated API).

Real-data facts the tests rely on (and document): `eventId` is not chronological (order by `sortOrder`); shootout attempts arrive as `goal` events with `periodType: "SO"` at `00:00` and do not move the score (the scoreboard adds the winning +1); regular-season OT is 5:00 (`timeInPeriod + timeRemaining = 05:00`... tested as 300 s).

## Builder API (`tests/fixtures/gc/builder.mjs`, re-exported by `tests/browser/gc-qa-fixtures.ts`)

All functions return a new raw envelope; none mutate their input. Raw is the NHL shape; `feedOf(raw)` = `normalizeGameFeed(raw)` = what `/api/game/:id` returns.

| Label | Functions | Mutation |
| --- | --- | --- |
| **real** | `REAL.live/reg/ot/so()` | none |
| real plays, derived envelope | `slice(raw, sortOrder)`, `pollSequence(raw, n or cuts)`, `cutPoints` | Plays with `sortOrder > cut` removed (a poll earlier in the game); envelope score/sog recomputed from the kept real plays; period from the last kept play. This is what a poll N of a live game would contain |
| real plays, derived envelope | `withState(raw, "pre"|"fut"|"live"|"crit"|"ot"|"so"|"final"|"off"|"ppd"|"cncl"|"susp", {clock})` | Only `gameState`, `gameScheduleState`, `clock`, `periodDescriptor` (ot/so); pre/fut/ppd/cncl/susp also empty the plays and zero the score |
| **derived** | `relabelShotAsGoal(raw, eventId?)` | A real shot-on-goal becomes a goal: scorer = shooter, score-after = previous total + 1 |
| **derived** | `removeEvent(raw, id)` | Event deleted (a disallowed goal vanishing). Combine with the previous to model "goal, then disallowed" |
| **derived** | `swapOrder(raw, a, b)` | Two events exchange `sortOrder` (reordered feed) |
| **derived** | `changeAssists(raw, eventId, [ids])` | Assist fields rewritten (official-scorer correction) |
| **derived** | `dropTimestamps(raw)` | `timeInPeriod`, `timeRemaining`, `sortOrder` deleted from every play (malformed feed) |
| **replicated** | `replicate(raw, 400)` | The real plays repeated with fresh eventIds and increasing sortOrder to size a stress test; not a game (same plays recur, scores meaningless) |
| helpers | `scoringGoals(raw)`, `provenance(raw)`, `gameOf(raw, over)`, `liveBodyOf`, `feedOf` | |

Playwright helpers (`gc-qa-fixtures.ts`): `serveGame(page, steps)` (the Nth `/api/game` request gets step N, last repeats; returns `{log, hits, seek}`), `openFromHome(page, steps, {rowState})` (mocks `/api/live`, season snapshot, serves the feed and opens the Game Center by clicking the real scoreboard row; the row is dated today so it shows), `GAME_DIALOG`. Aliases `buildPollSequence`, `sliceAt` exist for compatibility with the other builder (`gc-fixtures.ts`, Agent 2); on a naming conflict at merge this file's names win.

Limits: only real games' plays are used, so strength situations (`situationCode`) follow the real play; no real "delay" state exists in the feed, none is simulated. `withState("live")` on a finished game's plays keeps `periodDescriptor` of the original unless the state sets it.
