# Phase 5: live data and game state engine

Owner: Agent 2. Code: `src/lib/game-state.mjs`, `src/lib/event-store.mjs`, `src/lib/game-poller.mjs`, `src/lib/tab-leader.mjs`, `src/lib/use-game-feed.ts`, `src/components/gc/GameCenterContext.tsx`, `src/worker.js` (`/api/game/:id`).
Tests: `tests/game-state.test.mjs`, `tests/event-store.test.mjs`, `tests/game-poller.test.mjs`, `tests/worker-game.test.mjs`, `tests/browser/gc-engine.spec.ts` (helpers in `tests/browser/gc-fixtures.ts`, `tests/fixtures/poll-sequences.mjs`).

## Providers

| Data | Source | Route | Edge TTL |
|---|---|---|---|
| Scoreboard (all games today, clock) | NHL api-web `/score/now` | `/api/live` | 15 s |
| One game (play-by-play, roster, clock, situation) | NHL api-web `/gamecenter/:id/play-by-play` | `/api/game/:id` | 15 s live / pregame, **120 s FINAL**, **3600 s OFF only** |
| Unpublished game | upstream 404 | `/api/game/:id` answers **404** (15 s), never 502 | 15 s |

No new backend, transport or dependency. The NHL feed sits behind its own ~15 s cache, so polling faster than 15 s gains nothing. The response shape is additive: `normalizeGameFeed` is unchanged and `normalizeScoreboard` now also carries `clockRunning` and `clockSeconds` (the NHL `clock.running` and `clock.secondsRemaining`); they are intentionally not part of `LIVE_FIELDS`, so `mergeScores` keeps its referential stability. One URL per game: `/api/game/:id`, the old `?score=` cache-key trick is gone (the edge cache key already ignored the query, but the client split subscriptions by it).

Real goal shape, verified against NHL game 2025020500 and 2026020282 with `curl https://api-web.nhle.com/v1/gamecenter/<id>/play-by-play`: a goal play has `details.scoringPlayerId`, `assist1PlayerId`, `assist2PlayerId` (absent for unassisted), `goalieInNetId` (absent on an empty net), `homeScore`/`awayScore` (score after the goal), `eventOwnerTeamId`, `zoneCode`, `shotType`, plus `highlightClip*` and `pptReplayUrl` which we do not use. `normalizeGameFeed` already maps these correctly (assists, goalie, score after); no change was needed. Trimmed real events are committed as `tests/fixtures/real-goal-events.json` with provenance inside the file and are asserted in `tests/event-store.test.mjs`.

## Normalized state: `phaseOf(gameOrFeed, {now})`

`scheduled | pregame | live | intermission | overtime | shootout | final | final-ot | final-so | postponed | suspended | cancelled`, with `label`, `live`, `final`, `clock {period, periodType, remaining, running, intermission}`, `stale`, `reason`. `transition(prev, next)` returns `{from, to}` only when the phase changed (never on the first observation). `isLive`, `isFreshLive`, `isCalledOff` and `gameStatus` are thin views of it.

Rules: LIVE/CRIT is live (intermission flag wins, then periodType SO, then OT); OFF/FINAL is final, and final/OT or final/SO is read from `end` or, for a game feed (which has no gameOutcome), from the last period's type; a postponed, canceled or suspended schedule state counts only when the game is neither live nor finished; PRE is `pregame`, everything else `scheduled`.

Limits:
- **There is no "delayed" phase.** The feed has no field for a delayed start; a game just stays FUT/PRE past its scheduled time. We show it as scheduled/pregame and never claim a delay.
- `stale` (the phase's own flag) means LIVE/CRIT more than `STALE_LIVE_MS` (8 h, the one shared constant, also used by the worker) after puck drop. Staleness of a *poll* is a separate flag (below).
- `clock.running`/`remaining` come from the feed's clock fields when present, else `remaining` is parsed from `mm:ss` and `running` is null (unknown).

## Polling table (`pollPlan`, `game-poller.mjs`)

| Phase | Cadence | Notes |
|---|---|---|
| live, overtime, shootout | 15 s | |
| intermission | 30 s | |
| pregame / scheduled, puck drop within 30 min (or already past) | 30 s | |
| pregame / scheduled, further away | 60 s | |
| final, final-ot, final-so | one fetch, one recheck about 3 min later (95-105 %), then stop | late corrections; a changed result restarts the normal plan |
| postponed, suspended, cancelled | one fetch | |
| unpublished (404) | the phase's normal cadence, no backoff | message "Play-by-play is not published for this game yet." |
| failure | backoff 5, 10, 20, 40, 60 s (cap), each x0.5-1.0 random jitter | last data kept, `error` set |
| hidden tab | no requests | one catch-up fetch on show, only if the data is older than the interval |
| passive subscribers only (small cards) | at least 30 s for live games, no final recheck | a Game Center on the same game raises it to the table above |

One poller per game per tab (reference counted, kept 10 s after its last subscriber so a card unmounting as the Game Center opens does not refetch); every pane and card shares it, so several panes never multiply requests.

## Stale rules

`stale` = the last good response is older than 2 x the expected interval, never less than 45 s (live 45 s, intermission 60 s, pregame 60-120 s). Never raised while the tab is hidden or during the single catch-up fetch after showing it; cleared by the next good response. Finals and called-off games have no expected interval and are never stale by age. `stale` also includes the phase's 8 h stale-live rule. Stale data is never shown as confirmed live: the UI must read `stale` (or `phase.stale`) before saying LIVE.

## Cross-tab polling (`tab-leader.mjs`)

One `BroadcastChannel` per game. Every tab sends a heartbeat (2 s) with its visibility; the **visible tab with the lowest id (oldest) leads** and polls, broadcasting each raw response; followers apply it through the same reconciliation and never fetch. A hidden tab never leads, so when all tabs are hidden nobody polls; a tab that is shown leads at once. A newcomer is a follower for 250 ms and asks for the current data. A silent leader is dropped after 6 s. Without BroadcastChannel (or if it throws) every tab polls independently (the old behaviour). Limit: two tabs becoming visible in the same instant may both fetch once.

## Event store and reconciliation (`event-store.mjs`)

`reconcile(prevStore, plays, {seq, gameId}) -> {store, events, added, changed, removed, voided, score, dropped}`.

- Key = NHL `eventId` (store key `gameId:eventId`); order = period, `order` (sortOrder), time, id; missing period/order/time sort last and never throw. Unchanged events keep their object, and `events` keeps its identity when nothing changed.
- `changed`: FNV-1a content hash of the whole play differs (assist, scorer, strength...).
- Sequence guard: every request carries an increasing `seq` (issue time, forced to grow); a response older than one already applied is dropped, from this tab or from a broadcast. An empty play list never erases the store.
- Prefix rule: events beyond the last `order` of a response are kept (a lagging edge copy never shrinks the list, goals included).
- Debounce: an event inside the response's range that is missing is removed only after **two consecutive** responses; a goal removed this way is `voided` (and in `removed`), and `score` falls back to the last remaining goal's score. It reappears with the same id: counting resets (or `added` with `reinstated` after a void).
- Fingerprint re-match: a gone goal and a new goal with the same `period:time:team:pid` are the same goal: `changed` with `reason: "rekeyed"`, `from: oldId`.
- Limits: the feed has no review field, so "goal under review" cannot be shown; a void is detected only by the goal vanishing for two polls.

`feed.plays/goals/shots` exposed by the provider are the reconciled lists, so a goal does not flicker out for the one debounced poll.

## Game Center provider additions

`useGameCenter()` now also returns `events`, `phase`, `changes` (`{seq, added, changed, removed, voided}` of the last applied poll), `lastGoalIds`, `transition` (`{from, to, seq}`), `score`, `retry()`, `loading`. Existing fields are unchanged. Cards and sections outside the provider use `useGameFeedData(game|null)` (`src/lib/use-game-feed.ts`), a `{data, error}` drop-in for the old `useFeed('/api/game/...')`, on the same shared poller.

## Test fixtures

All sequences derive from the real recorded `tests/fixtures/raw-live-game.json` (sliced by sortOrder, envelope-only state changes). Derived transformations (goals in the real layout, a goal removed, a goal re-keyed) are labelled in `tests/fixtures/poll-sequences.mjs` and `tests/browser/gc-fixtures.ts`. `GC_NOW` (puck drop + 1 h) must be the page clock, otherwise the recorded game reads as stale-live.
