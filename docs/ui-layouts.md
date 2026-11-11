# UI layouts: dashboard hosting pages (Agent 2)

Scope: how the pages that host gauges lay them out (Gauge.tsx / gauge.css belong to the gauge agent). Measured with Playwright in Chromium against the repo fixtures (Team Stats: the real CAR at VGK boxscore sample, 3 gauge stats; recap: tests/browser/game-recap.spec.ts live fixture BOS at TOR). Heights are the element's border box in px.

IMPORTANT: "after" numbers were taken BEFORE the gauge agent's CSS merged (the `compact`/`standard` size classes are unstyled, `.gauge-grid` is still the old flex rule), so dial sizes are the old 112px ones and some captions are slightly taller. Re-run `tests/browser/layout-efficiency.spec.ts` after the merge; the CSS below is written to hold either way.

## Changes
| Area | Change |
|---|---|
| Team Stats gauges (`TeamStatsPane.tsx`, `stats.css`) | `.gcs-gauges.gauge-grid` of `.gauge-item` cells (keep `data-testid=gc-gauge-<key>` and the dial's role=img name), `size="compact"`, columns `repeat(auto-fit, minmax(min(100%,100px),1fr))`, `align-items:start` (the Src chip no longer unbalances rows), grid capped at 760px and centred. |
| Recap comparison (`GameRecap.tsx`) | `.gr-cgrid.gauge-grid` of `.gauge-item` cells, compact dials, 3 across at 360-390. |
| Period breakdown (`GameRecap.tsx`) | The 2-5 one-number dials became rows: `.gr-period` (class and `data-period` kept) with the period name, both team codes and numbers (xG as d.dd) and a split bar. Same information as the dial (label, both numbers, the split); role=img name `1st period: BOS 2, TOR 2`. last-night.spec now asserts `.gr-period` text instead of `.gr-period .gauge`. |
| Game data panel (`GameDataPanel.tsx`) | `.game-stat-gauges` cells wrapped in `.gauge-item`, compact. Ice tilt and the pregame projection dial sit in `.gauge-lone` (grid, centred, `max-width: var(--gauge-standard)`, defined in styles.css) so a lone dial is proportional instead of full row. The deserved-to-win hero, the model win probability and the projection stay radial. |
| Team comparison (`TeamComparison.tsx`, `team-comparison.css`) | Goalie SV% / GAA: text-first `.split-row` (label, both values, thin split bar; same share formula and span as the dial). Crossover: the 86px dial is replaced at <=620px by `.gap-bar` (same rank-strength share, the `.gauge` stays in the DOM and is shown >=621px); `.metric-side` min-height (104/118px) removed. comparison.spec waits for `.gap-bar` at <=620 and `.gauge` above. |

Evaluated and left unchanged: Picks `.pk-stats` (3 columns at 320 give ~70px content per card for an 11px label: fits), gsax `.gx-cols` (capped at 900px on wide screens by design, no height cost), NHL+ `.pm-cell` (min-height 5.5rem is within ~10px of the content height of a one-row cell).

## Measurements (before, after)
| Section | 390 before | 390 after | 1440 before | 1440 after |
|---|---|---|---|---|
| Team Stats gauge section (`.gcs-gauges`) | 981 (3 dials 366px, 1 per row) | 141 (3 dials ~115px, 1 row) | 134 | 139 |
| Team Stats pane total | 1591 | 751 | 702 | 707 |
| Recap period breakdown | 155 | 144 | 161 | 72 |
| Recap comparison (`.gr-compare`, 6 dials) | 228 | 238 (pre-merge captions) | 231 | 241 |
| Ice tilt (lone dial) | 469 (366px dial) | 324 | 348 | 231 (pre-merge: 112px dial; becomes 190px) |
| Goalie SV%/GAA | 158 | 82 | 113 | 37 |
| Crossover (4 rows) | 579 (74px dials) | 513 (bars) | 639 | 639 |
| Whole recap card (Overview) | 1543 | 1542 | 1501 | 1412 |

Ceilings enforced in `layout-efficiency.spec.ts`: Team Stats gauge section <= 420px at 390 (before 981) and <= 220px at 1440 (before 134; regression guard only, the 1440 layout was already one row).

## Spec (tests/browser/layout-efficiency.spec.ts)
Team Stats tab: >=3 gauges share a row at 390 and 360; not one per row at 1440; section height under the ceilings; cells inside their grid and no page overflow at 320/375/430/768/1024/1440/1920. All hold before and after the gauge agent's merge.
