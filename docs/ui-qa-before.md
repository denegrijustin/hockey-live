# UI QA: "before" measurements (claude/phase2, before ui-gauge / ui-layouts / ui-close)

Measured with `tests/browser/ui-qa-measure.spec.ts` (real recorded fixtures through `openGameCenter`; final = real regulation game, live = real live envelope, pregame = real game in FUT state; box score = real CAR at VGK sample). Re-run the same spec after the merge and compare. All sizes are CSS px.

## Existing automated checks

| Check | Result |
| --- | --- |
| Lint | **There is no lint script and no ESLint config** (`package.json` has none). Nothing to run. |
| `npx tsc --noEmit` | clean (exit 0) |
| `node --test tests/*.test.mjs` | 550 tests, 549 pass, 1 fail: `playoff-sim` "20,000 sims ... well under 3 s" took 8.4 s on this loaded box (timing, unrelated to UI) |
| `npx vite build` | ok; main JS 401.4 kB / **129.8 kB gz** (limit 135) |
| `node scripts/check-budget.mjs` | all ok; **index CSS 30.5 KB of 32 KB (only 1.5 KB headroom)**, GameOverlay JS 14.4 KB |

## Dial sizes (width x height, `.gauge` bounding boxes)

Team Stats tab (final game). Three `.gcs-gauges` dials (Shots on goal, Faceoff %, Hits):

| Viewport | dial size | per row | `.gcs-gauges` block | whole Team Stats pane |
| --- | --- | --- | --- | --- |
| 320 | 296 x 247 (100% of parent) | 1 | 828 | 1454 |
| 375 | 351 x 287 (100%) | 1 | 949 | 1559 |
| 390 | 366 x 298 (100%) | 1 | 981 | 1591 (live: 1623) |
| 1440 | 405 x 113 (100% of its cell) | 3 | 134 | 702 (live: 734) |

Other dials in that pane: crossover (matchup comparison) 74 x 71 at 320-390 (167 x 153 goalie dials at 375), 110 x 97 at 1440.

Overview hero (final game recap `.gr-hero`, two lg dials side by side or stacked):

| Viewport | `.gr-hero` height | hero dials |
| --- | --- | --- |
| 320 | 290 | 282 x 239, 296 x 268, then period dials 144 x 136 |
| 375 | 330 | 337 x 279, 351 x 308 |
| 390 | **341** (live game: **702**, two stacked 352 x 290 + 352 x 318 dials) | 352 x 290, 366 x 319, period dials 117 x 116 |
| 1440 | **416** (live game: 307) | 586 x 369, 260 x 235, period dials 150 x 113 |

Pregame lone projection dial (`.projection` lg): 366 x 319 at 390 (full row), 351 x 308 at 375, 260 x 184 at 1440.

Root-cause confirmation: at every phone width every Team Stats dial and every lone lg dial has width/parent = 1.00 and mates = 0 (one per row, ratio 1); at 1440 the `.gcs-gauges` dials are 405 wide and 113 tall (three per row, ratio 1.00 of an oversized cell).

## Close button on the current app (claude/phase2)

`dialog.game-dialog button[aria-label^="Close"]`, exactly 1 visible. Position relative to the dialog box, at dialog scrollTop 0, 600 and fully scrolled (about 3300 to 6000 px):

| Viewport | from top | from right | size | after scroll |
| --- | --- | --- | --- | --- |
| 390 (phone) | 22 | 12 | **68.9 x 42** (under 44 high) | identical at all scroll positions (Phase 5 sticky toolbar works) |
| 1440 | 24 | **100** (not in the corner) | 77.8 x 44 | identical at all scroll positions |

So pinning already works; what fails the new spec is: height 42 on phones (below 44), and on desktop the control sits 100 px in from the right edge, and the label is a wide "Close x" / "Done" pill.

## Findings on the current app

1. **Scroll restore drift** when closing a Game Center opened from a status-filtered scoreboard day: closing returns to a different window scrollY (1440: 185 -> 128, 57 px; 390: up to ~1.7k px off on a tall filtered list, and the result varies between runs). Date strip selection and the active filter ARE preserved (ungated test passes). Cause not investigated; `history.state.scroll` stored at open already differed from the scrollY measured just before the click. The spec `returns to the same schedule ... window scroll preserved` is gated (fails today).
2. Boxscore-less / 500 states are safe: no NaN, no broken svg paths (ungated tests pass).
3. Theme contrast of gauge arcs and captions passes in light and dark today.
4. All specs that match `aria-label^="Close"` also pass for the old label; the old `Close full game view` label is asserted by older specs (list in `ui-common.md`).
