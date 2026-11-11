# Gauge sizing conventions

One component draws every dial: `src/components/Gauge.tsx` (styles in `src/components/gauge.css`). The SVG viewBox is 200x146, so a dial's height is always 0.73 x its width.

## The rule

A dial is as wide as its **variant** needs and never as wide as its parent. The figure is `width: 100%; max-width: var(--gauge-w); margin-inline: auto` and the svg is `width: min(100%, var(--gauge-w)); height: auto`. A wide parent never grows a dial; a narrow parent shrinks it proportionally (needle, ticks, logos and strokes all scale with the viewBox, the needle turns about the hub in viewBox units).

## Variants (`size` prop)

| size | `--gauge-w` token | width | caption type | use |
|---|---|---|---|---|
| `compact` (alias `sm`, the default) | `--gauge-compact` | 120px | `.sm`: team code over number, 0.75rem numbers | a dial in a grid of dials; one number among many |
| `standard` (alias `lg`) | `--gauge-standard` | 190px | `.lg`: 1.35rem numbers (1.6rem on phones) | one dial that carries its own section; the two headline dials on a phone |
| `expanded` | `--gauge-expanded` | 280px | `.lg` | a lone headline dial on a wide row; the headline pair at 721px and wider |

The legacy `.sm` / `.lg` classes are still rendered (plus `.compact` / `.standard` / `.expanded`) so existing selectors keep working. `--gauge-w` is set by the variant class, so a host can override it for one place (`.metric-gap .gauge { --gauge-w: 140px }`).

## Hosting dials

- `.gauge-grid`: `display:grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 150px), 1fr)); gap: 12px 14px; align-items:start; justify-items:center`.
- `.gauge-item` (also applied to every direct child of `.gauge-grid`): `width:100%; min-width:0; max-width:220px`. Use it on a wrapper that holds a gauge plus a caption or source chip. Do not put an expanded dial in a `.gauge-item` (220px cap).
- Phone breakpoint is 720px. The old `max-width:none` overrides at 700px are gone; nothing stretches a dial on a phone.
- `.gr-hero` is two columns at every width. At 720px and below each dial is the standard size (about 168px at 390). From 721px each is expanded (273px at 1440). A lone dial (`.gr-hero > :only-child`) spans the row, is centred, capped at 320px, and is expanded.
- Colours come from tokens (`--logo-chip` for the logo chip, `--line-2`, `--text-*`, `--surface-5`, `--series-*`); `gaugeColors` is unchanged.

## Mapping of every usage

| Where | Component call | Variant | Notes |
|---|---|---|---|
| Recap hero, deserved to win (`GameRecap.tsx` `Deserved`) | `size="lg"` | standard on phones, expanded at 721px+, expanded when alone | `.gr-deserved` |
| Recap hero, model win chance / projected score (`GameOverlay.tsx`) | `size="lg"` | same as above | `.gr-model` |
| Recap team numbers (`GameRecap.tsx` `.gr-compare`) | default | compact | in `.gauge-grid` |
| Recap period breakdown (`.gr-pgrid.gauge-grid > .gr-period`) | default | compact | |
| Pregame projection (`Projection.tsx`) | `lg` (pregame), `sm` (live/final) | standard / compact | centred, one dial |
| Ice tilt (`GameDataPanel.tsx` `IceTilt`) | `ComparisonBar size="lg"` | standard | was 260px, now 190px |
| Game data stat gauges (`.gauge-grid.game-stat-gauges`) | `ComparisonBar` | compact | |
| Team stats pane (`gc/stats.css` `.gcs-gauges`, `TeamStatsPane.tsx`) | default | compact | host grid belongs to the layout pass |
| Starting goalies (`TeamComparison.tsx` `.goalie-gauges`) | default | compact | |
| Offense vs defense (`TeamComparison.tsx` `.metric-gap`) | default | compact, `--gauge-w: 140px` override | label only; values sit in the side cells |

## Measured before and after

Real Game Center (live game fixture, `tests/browser/game-recap.spec.ts` data), dial svg width x height in px, measured with Playwright `getBoundingClientRect`.

| Dial | 390px before | 390px after | 1440px before | 1440px after |
|---|---|---|---|---|
| Hero deserved | 352 x 257 | 168 x 123 | 273 x 199 | 273 x 199 |
| Hero model | 352 x 257 | 168 x 123 | 273 x 199 | 273 x 199 |
| Hero box height (two dials) | 702 | 242 | 307 | 307 |
| Ice tilt | 366 x 267 | 190 x 139 | 260 x 190 | 190 x 139 |
| Lone recap deserved | 340 x 248 | 190 x 139 | 190 x 139 | 190 x 139 |
| Team-number dials (6, in `.gr-compare`) | 108 x 79 | 120 x 88 | 109-112 x 79-82 | 120 x 88 |
| Game-data stat gauges | 179 x 131 | 120 x 88 | 112 x 82 | 120 x 88 |
| Period dials | 104 x 76 | 120 x 88 | 112 x 82 | 120 x 88 |

Row waste: at 390 the hero was two stacked ~257px-tall dials (702px for the box, one dial per row, each as wide as the screen); it is now one row of two dials 242px tall, 460px saved on a phone. A game-data pair of dials was 179px wide (flex stretched them in a 366px row); they are the compact 120px. The hero at 1440 is unchanged (273px dials in two half-width columns).

## Tests

`tests/browser/gauge-sizing.spec.ts`: no dial exceeds its parent or its resolved `--gauge-w` at 320, 360, 390, 1440 and 1920; no horizontal overflow at 320; the hero pair shares a row at 390 and 360; a lone/hero dial never fills a wide row at 1440 and 1920.
