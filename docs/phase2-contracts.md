# Phase 2 contracts (homepage, game cards, schedule, discovery)

Base: branch `claude/phase2` (Phase 1 navigation: Home, Games, Standings, Teams, More). Keep every existing route, `?view=` id and test-id unless a spec is deliberately updated.

## Shared libraries (already in the branch; do not change signatures)
- `src/lib/dates.mjs`: `isDay, etDay(when), shiftDay(day,n), dayDiff(a,b), relativeDay(day,today)`. NHL `game.date` is the Eastern hockey day; `game.start` is ISO UTC. "Today" is the Eastern day (`useEtToday`). Times shown to people are the viewer's local time.
- `src/lib/game-status.mjs`: `gameStatus(g,{now,withZone}) -> {kind,label,short,aria,live,final,upcoming,stale}` with kind `upcoming|live|intermission|final|postponed|cancelled|suspended`; `localTime(start,{withZone})`. Every card/tile/ticker item must take its status text from here.

## Component contracts
- `GameCardView` (Agent 2, `src/components/GameCardView.tsx`): props `{game, away, home, variant:"row"|"compact"|"tile", context?, insight?, actions?, below?, ranks?, record?, rating?, onOpen(game), className?}`. One primary `<button class="sb-main">` opens the game (Game Center via `onOpen`); secondary actions are siblings, never nested. Keeps class aliases `.sb-row .sb-main .sb-name .sb-rank .sb-status .sb-score .sb-prob .sb-venue .gc-icon` and `data-game`. Status text from `gameStatus`. State classes `.live .final .soon` stay on the root.
- `DateStrip` + `useSelectedDate` (Agent 3): `src/components/DateStrip.tsx`, `src/hooks/useSelectedDate.ts` as in the Agent 3 proposal. Date in the URL as `&date=YYYY-MM-DD` only when the person picked a non-automatic day; keep `Previous day`/`Next day` button names and the `.sb-day h1` / `.sb-day span` header.
- `matchupInsights(game,before,table,ctx) -> Insight[]` (Agent 4, `src/lib/insights.mjs`, pure) and `InsightLine` (`src/components/InsightLine.tsx`). Card headline shows `insights[0]` only; the rest are in the why popover / Game Center.
- Home sections (Agent 1, `src/components/home/*`): each section renders only when it has data, a game appears in exactly one of Live / Upcoming / Completed.

## Test-id contract for Home (Agent 6 writes specs against these; Agent 1 renders them)
`data-testid`: `home-date` (selector), `date-strip`, `date-today`, `date-picker`, `home-section-live`, `home-section-upcoming`, `home-section-completed`, `home-section-featured`, `home-section-intel`, `home-empty`, `home-error`. Sections are `section[role=region][aria-label="Live"|"Upcoming"|"Completed"|"Worth watching"|"League intelligence"]`. Keep `.sb-group`, `.sb-row`, `[data-testid=sb-done]`, `[data-testid=watch-now]` working or update the specs that use them in the same change.

## File ownership (no agent edits another's files; ask the lead)
- Agent 1: `src/components/Scoreboard.tsx`, `WatchNow.tsx`, `src/components/home/*`, `src/scoreboard.css`, Home rules in `src/motion.css`, the Home branch of `src/App.tsx` (render call only).
- Agent 2: `GameCardView.tsx`, `GameCard.tsx`, `ScoreTicker.tsx`, TeamSchedule/LastNight card presentation only, `src/lib/ticker.mjs` (status text), card CSS (`src/game-card-view.css` new, `.game-card/.matchup/.gc-icon` rules in `styles.css`).
- Agent 3: `DateStrip.tsx`, `useSelectedDate.ts`, `useEtToday.ts`, `useGameLists.ts` (ET today fix), `GameFilters.tsx`, `src/lib/watchability.mjs` (`slotOf` only), App.tsx `viewFromAddress/addressFor/dayHeading` only, `src/team-schedule.css`.
- Agent 4: `src/lib/insights.mjs`, `tests/insights.test.mjs`, `InsightLine.tsx`, `GameOverlay.tsx` "Why this game matters" section only.
- Agent 5: `src/lib/game-data.mjs`, `normalize.mjs`, `polling.ts`, `api.ts`, `useSeason.ts`, `src/worker.js`, `wrangler.toml`, `src/lib/game-status.mjs` internals (keep the contract), docs of edge cases.
- Agent 6: `tests/browser/fixtures-games.ts` and new `tests/browser/home-*.spec.ts`, QA report. May fix assertions in existing specs only when a deliberate contract change breaks them (list each).

## Rules
No mock data in the app. No new backend or provider. No dependency additions. No deploys. Run only targeted specs (the full suite is run by the lead). Use your own preview port (PORT env) with the shared config at /tmp/claude-0/-home-user-hockey-live/4e18fd4c-d9f5-58f4-a367-d2a96a19330f/scratchpad/pw.wt.config.ts (`WT=$(pwd) PORT=<yours> npx playwright test -c <config> <spec>`; `pnpm install --frozen-lockfile` + `pnpm build` first in a worktree; never run `playwright install`). Commit on your worktree branch with the trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; do not push or open PRs.
