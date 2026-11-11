# Phase 5 QA report (final wave, Agent 8)

Branch `claude/p5-qa-final` (claude/phase2 merged). Everything below was run by me on the merged app: `vite build` + `vite preview` on port 4228, Chromium, desktop 1440x1000 and mobile 390x844 projects. Data: real recorded NHL games (`docs/phase5-qa-fixtures.md`), derived variants labelled.

## What was run
| Run | Result |
| --- | --- |
| `node --test tests/*.test.mjs` | 568 / 568 pass (includes `phase5-integrity` 27, `phase5-validation` 18, `phase5-bench` 1) |
| `npx tsc --noEmit` | clean |
| `node scripts/check-budget.mjs` | all files ok (largest shown 0.4 KB lines are the tail of the list; no failures) |
| Playwright `gc-*`, `alerts-goals`, `alerts` (desktop+mobile) | 245 passed, 1 failed (a timing flake in `gc-engine` hidden-tab, fixed after: 10/10 stable when repeated), before `gc-a11y` |
| Playwright `gc-a11y.spec.ts` (new) | 26 tests: 24 passed + keyboard 2 passed after fixing my own assertion |
| `gc-qa.spec.ts` (5 formerly fixme tests now live) | all pass on both projects (tabs at 360, play-by-play place/focus/unique ids, live region silent/once, disallowed goal once, status pill contrast in light and dark for 10 states) |

## Defects found and fixed
1. **Stale pill contrast (real defect).** `gc-status` in the `stale` state was amber text on a pale pill, 2.03:1 in light theme. Text now mixes the amber with the theme text colour (`game-center.css`); all 10 states pass 4.5:1 in both themes.
2. **Play-by-play lost the reader's place on every live poll** (newest-first mode, scrolled down: each poll pushed the row being read down ~90 px per new event; browser scroll anchoring does not hold here). `PlayByPlay.tsx` now remembers the first row in view and restores it after the list changes (not at the very top, so the newest rows still show there). Verified on desktop and 390px mobile (row stays at the same pixel position across 3 polls, focus kept).
3. **Goal alerts double-fetched `/api/game`** next to a visible card or open Game Center (alerts used the old `polling.ts` cache, cards the new `game-poller`). Added `fetchGameFeedOnce` in `game-poller.mjs` (uses the shared per-tab poller and its raw play list, so the alert engine keeps its own two-poll debounce); `alerts-runtime.ts` uses it.
4. **Passive cards fetched stale-live games** (live more than 8 h after puck drop). `useGameFeedData` now returns idle for a stale-live row; only an open Game Center recovers it.
5. Test defects: fixture feed carried the real (old) puck drop so every "live" game was stale-live (the builder now shifts `startTimeUTC`); one-shot `runFor(600000)` skipped timers re-armed after a fetch (specs now step the clock); gc-pbp/gc-engine had tab-probing and count races; two-tab bound (<= 8) was wrong, see below.

## The lead's priority items
1. **Hidden tab catch-up.** Engine is right (hidden: no requests; on show: one catch-up when data is older than the interval). `gc-qa` "hidden tab" passes (it was weak: one big `runFor` could not distinguish). `gc-engine` hidden-tab had a real-time race (fetch not issued within the fake-clock step under load): now `expect.poll`.
2. **Two tabs 11-12 requests vs <= 8: nothing polls twice.** The follower makes 0 requests; the leader fetched every ~8 test iterations because the page clock also runs in real time (each iteration is about 1.9 fake seconds), i.e. 15 s cadence over about 180 fake seconds = 12. The test now measures elapsed fake time and asserts the leader's count is within +-1 of elapsed/15.
3. **Not followed / alerts off / stale.** The visible live card legitimately reads the shared feed once for its ice view (passive, 30 s cadence), so "fetch nothing" was too strict for non-followed games; assertion is now "at most 1, none from the alert engine". Stale-live games are fixed (item 4 above) and fetch nothing.

## Data integrity (real games, `phase5-validation.test.mjs`, `phase5-integrity.test.mjs`)
Verified: ordering by sortOrder (eventId is not chronological in real data), unique stable ids, goals vs final score (SO winner's +1 is not in the play list; the line score derives an SO column from it), period labels incl. OT/SO, clock parsing and `elapsed + remaining = period length`, overlapping polls never duplicate (every poll delivered twice), identical poll changes nothing, response-order guard, prefix never shrinks the store, disallowed goal voided only after two polls and score lowered once, goal re-published under a new eventId is not a new goal, changed assists are a `changed` on the same event, reordered events keep all ids, missing timestamps do not throw, incremental momentum series equals full recompute (REG/OT/SO), SO adds no time to the axis, play-by-play filter groups partition every event, goal list/jump wrap, strength labels, goal alerts exactly once per real goal across polls and after a "reload" (state kept) with a single retraction, deep-link parsing (hostile/malformed/unknown ids ignored), intel items have a basis from the fixed set, unique ids, honour `exclude`, and nothing for a postponed game.

Team stats Official vs Derived labels, player tables, notable performances: covered by Agent 4's `gc-stats.spec.ts` (all pass here, built from a real recorded boxscore + right-rail); I did not re-derive them independently. **Not testable on the static preview: the worker's `/api/boxscore` right-rail fetch** (needs the Worker); the specs serve a real recorded right-rail through `normalizeBoxscore`.

## Performance
- Requests (live Game Center, 30 s): `/api/game` 2, `/api/live` 2, `/api/boxscore` 2-3 (one shared timer); Home alone 30 s: `/api/live` 2, seasons 1 each. 60 s with Game Center: `/api/game` 3-5. Final game: 1 fetch, exactly one recheck at about 3 min, then none (verified minute by minute).
- 400 replicated events: dialog open 1.5-1.9 s (preview, loaded machine), 1,752 DOM nodes, per-poll frame settle 20-75 ms, no long tasks during polls.
- Node: `normalizeGameFeed` 400 plays 0.4-0.5 ms; `reconcile` 400 from empty 4 ms, +10 onto 400 about 11 ms, **identical no-op poll 10-32 ms** (it hashes every event each poll; 800 plays about 40 ms). Not a user-visible problem at 15 s cadence but a candidate optimisation (skip hashing when the play object is unchanged).
- Rerender counters / React profiler: **not run** (no profiler build in this environment).

## Layout and accessibility
- No sideways scroll on every tab (Overview, Play-by-Play, Team Stats, Players, Matchup Intelligence) at 320, 360, 390, 430, 768, 1024, 1440, 1920 with a 400-event history; 12 game states at 360 (scheduled, pregame, live, intermission, OT, final, final OT, final SO, postponed, cancelled, suspended, 400 events). No console or CSP errors in those runs.
- Keyboard: roving tabindex (one tab stop), Arrow/Home/End, Tab never lands on page content behind the modal in 40 presses, Escape closes and focus returns to the opening control.
- Tap targets at 390px: tabs, close and play-by-play controls all >= 44px (none under).
- Live region: single polite atomic status region, empty on first render, silent for clock-only polls, goal announced once, score taken back announced once. Note: "Score changed" follows the official scoreboard score in the same response, not the event store's two-poll debounce (an event vanishing with the score unchanged is never announced).
- Reduced motion: card goal banner static. Light and dark contrast of the status pill: pass after fix 1.
- 200% zoom equivalent (640px wide, 200% text): no overflow, tab bar 1 row (tabs scroll within their bar, the fifth is clipped until scrolled, which is by design).
- Screenshots looked at (`p5-shots` in the scratchpad: 390 overview, 320 play-by-play, 1440 team stats, 200% zoom): layout is sound. Observations, not fixed: at 320px the play-by-play filter chips take about 300 px before the first event; the header's long "Outlook · 27/100 overall importance · Teams · League" line is dense on phones.
- Manual items still open (see `docs/phase5-a11y-checklist.md`): screen-reader pass (VoiceOver/NVDA), forced colours, chart text alternatives and keyboard inspect of the momentum chart (I checked the chart renders and has no overflow, not its alternative text), 400% zoom on desktop.

## Remaining / unverified
- Followed-games switcher: only covered by whatever Agent 7's specs do (they pass); no independent test written.
- Network interruption: tested with aborted `/api/game` for about 160 fake seconds, last data kept and live state recovers; offline/online events and the service worker were not exercised (SW is blocked in these runs).
- Background-tab behaviour with real tab visibility (only the emulated `hidden` property).
- Worker-side behaviour (TTL by state, 404 for unpublished games, right-rail) is untested here; a 404 from `/api/game` is covered via the static mock.
