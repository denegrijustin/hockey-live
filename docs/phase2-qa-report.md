# Phase 2 QA report (Agent 6)

Branch `claude/p2-qa`, base `claude/phase2` (c6228ff). Run: `pnpm build`, then `WT=$(pwd) PORT=4195 npx playwright test -c <pw.wt.config.ts> tests/browser/home-*.spec.ts --reporter=line`.
Result on the CURRENT app (no Phase 2 UI yet), both projects: 164 test runs, 119 passed (including 8 expected failures, below), 45 skipped (22 fixme x 2 projects, plus 1 mobile-only test skipped on desktop), 0 unexpected failures. `tsc --noEmit` clean.

## Shared fixtures: `tests/browser/fixtures-games.ts`
`etDay(offset)`, `snapshot()`, `liveFeed()`, `mockApis(page, {games, live?, season?, gameDetail?})` (routes `/api/live`, `/api/season/<id>`, `/data/seasons/<id>.json`, `/api/game/*`, `/api/moneypuck/**`, `/api/injuries/**`, `/api/picks/**`; returns `{log, setLive, setGames}`), `count(log, path|regex)`, `watchErrors(page)`, builders `mk.upcoming/live/intermission/final/ot/so/postponed(id, away, home, opts)` (opts: any Game field plus `offset` days, `time` UTC "HH:MM", `score` [away, home]).
Long names: team names come from the bundled `src/data/teams.json` (imported, never fetched), so they cannot be injected from a test. `longName` = CBJ at VGK, the longest real names ("Columbus Blue Jackets" / "Vegas Golden Knights"), tested at 360px.

## Test matrix

| Spec | Covers | Status |
|---|---|---|
| home-states | upcoming time, live P3 clock, intermission, OT, SO, finals F / F/OT / F/SO strip + Completed rows, chip counts, no duplicate rows | executed (desktop + mobile) |
| home-states | exact `Final/OT` text from `gameStatus` | fixme: Agent 2 GameCardView |
| home-states | postponed shows "Postponed" | executed as expected-failure (defect 1) |
| home-failure | season 500 -> /data fallback silent; live 503 pill; malformed JSON (API only, and API+saved); all sources down; empty day; zero games; unknown live id; pageerror/console watch | executed |
| home-failure | Retry clears the pill | executed as expected-failure (defect 2) |
| home-timezone | Auckland, Los Angeles, Helsinki: heading follows ET date, times in viewer zone (incl. 23:30 ET drop at 04:30Z), Tomorrow step, ET-midnight rollover (`useEtToday`) | executed |
| home-responsive | 360/390/768/1024/1440/1920 on Home and Games: no page overflow, tab bar below 1100 and sidebar from 1100, no overlapping card parts, nothing past the card edge, stepper/chips in viewport; long names at 360 | executed |
| home-a11y | Tab order stepper -> chips -> first game, Enter opens dialog and Escape closes, >=44px targets (mobile project only), reduced-motion default, focus rings, names/alt/landmarks/regions, stepper disabled state, chip aria-pressed | executed |
| home-a11y | focus returns to the opener after the Game Center closes | executed as expected-failure (defect 3) |
| home-perf | CLS < 0.1 on load and stepping; 1 `/api/live` + 1 season load on first paint (0 `/data` copy); no refetch when stepping; live poll per 30 s (clock.fastForward); no `/api/game` for unopened finals; an opened final fetched at most once and not polled | executed |
| home-sections (8) | Live/Upcoming/Completed order and membership, exactly-one-section, render-only-with-data, `home-empty`, Featured excludes live, League intelligence links, `home-error`, legacy test-ids | fixme: Agent 1 sections |
| home-dates (8) | prev/next/Today, picker, `&date=` in URL (absent on automatic day), Back, invalid date, date kept across Game Center, midnight rollover, empty day | fixme: Agent 3 DateStrip |
| home-insights (5) | reason line only when substantiated, none for gp<10, none in preseason, link targets, one headline insight | fixme: Agents 2 and 4 |

## Defects found in the current app (expected-failure tests: `test.fail(...)`; they flip to "unexpected pass" and must be changed to plain `test` once fixed)
1. Postponed games render as upcoming. `Scoreboard.tsx` `statusOf` ignores `scheduleState`, so a PPD game shows a puck-drop time instead of "Postponed". Fix owner: Agent 2/1 via `gameStatus()`. Test: home-states "a postponed game says Postponed", assertion `.sb-status` toHaveText(/Postponed/).
2. Retry does not retry the live feed. `App.refresh` calls `retry()` (season only) and dispatches `iceboard:refresh`, which only `useLeagueMatchups` hears; `useFeed("/api/live")` keeps its 30 s timer, so the "Live scores unavailable. Showing saved data." pill stays after a successful Retry until the next poll. Test: home-failure "/api/live recovering clears the pill on Retry" (pill still present after 8 s).
3. Focus is lost when the Game Center closes. `GameOverlay` unmounts the `<dialog>` and never refocuses the opening `.sb-main`; `document.activeElement` becomes `<body>`. Test: home-a11y "closing the Game Center returns focus to the game that opened it". Escape itself works.
4. Status text differs from the shared contract: `statusOf` renders "Final / OT" (spaces) where `gameStatus` says "Final/OT". Covered by the home-states fixme.
Observations, not defects: the stepper and chips are 34px on the desktop layout (>=1100px) by design, so the 44px check runs only on the mobile project; `Previous day` is disabled on the first day with games (tests include a past day when they need to focus it).

## Flaky / date-dependent notes
- Most specs build games relative to the real "today" (ET) via `etDay`; timezone and midnight specs pin the clock with `page.clock.install`, so they are deterministic.
- Live-poll spec: a poll tick landing while the previous request is in flight is skipped by design, so the test waits for network idle between fast-forwards (the first version failed on mobile without it).
- CLS and focus-ring checks depend on `reducedMotion: reduce` from the shared config.
- The 44px check is skipped on desktop; home-responsive runs on both projects but sets its own viewport, so the two projects duplicate each other.
- Baseline season fetch (`manifest.seasons[1]`) is not mocked and hits the preview server; request counts only count the current season id.

## How to un-fixme (after integration)
Each fixme is a `test.fixme(true, "<what it waits for>")` first line in its test. Delete that line, run the spec on both projects, then fix selectors in the spec if the final DOM differs from the contract (tests use `data-testid` home-section-*, home-empty, home-error, date-strip, date-today, date-picker, `insight-line` or `.insight-line`, `.sb-day h1`, `section[role=region][aria-label=...]`). For home-states "exact shared status text", also change the Completed-row regex in the executable test to the exact `Final/OT`. For the three expected-failure tests, delete the `test.fail(true, ...)` line once the defect is fixed. The `.sb-done` strip is legacy: if Agent 1 renders Completed differently, update home-states and home-perf (`getByTestId("sb-done")`, `.sb-done-chip` selectors) in the same change.
No existing spec was modified.
