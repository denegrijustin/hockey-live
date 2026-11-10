# Phase 5: Momentum (shot-attempt pressure)

Label in the UI: **Derived**. "Iceboard metric: shot-attempt pressure, not possession, not xG, not win probability." Code: `src/lib/flow.mjs` (tests `tests/flow.test.mjs`), pane `src/components/gc/MomentumPane.tsx`, styles `src/components/gc/flow.css`.

## Definition change (read this: an analytical model was changed on purpose)
`pulse.mjs gameFlow` (the compact card strip and the Game Center flow chart) used a different, undocumented-in-UI "momentum" index. It now delegates to `flow.mjs`, so the card, the chart and the Momentum pane agree. Return shape is unchanged (`{points:[{minute,value}], current, windowMinutes}` plus `series`) and the test ids (`compact-game-flow`, `game-flow`, `.flow-line`, four `.flow-time-mark`) are unchanged.

| | Before | After |
|---|---|---|
| Inputs | goal, SOG, missed, hit, penalty | goal, SOG, missed, blocked (hits and penalties excluded) |
| Weights | goal 5, SOG 1.25, missed 0.65, hit 0.3, penalty -1.6 (against the penalised team) | goal 1.0 (once), SOG 0.30, missed 0.15, blocked 0.10, credited to the shooter |
| Danger | none | x1.0 to x1.6 by distance for SOG/missed with x/y (x1.6 inside the existing 24 ft high-danger radius, linear to x1.0 at 60 ft) |
| Window | 5 min linear fade, sampled every 15 s | 5 min linear fade, sampled every 10 s (gameFlow keeps its 15 s step) |
| Scale | unbounded (about +-5) | (home - away) / 1.5, clamped to [-1, 1]; fixed constant, never the game's own max |
| Strength | none | power-play bands from `sit` (display only, not in the number) |
| Blocked shots | excluded | included at 0.10 for the shooting team (the feed's event owner of a blocked shot is the shooter's team; verified on the recorded game, and the roster wins when given) |

Compact chart readouts now show two decimals on the new scale; the compact label still reads "MOMENTUM" (existing test) with a title naming the metric.

## Inputs, limits
- Plays from the NHL feed (`normalizeGameFeed`): type, period, time, team, x, y, pid, sit, duration, score. Shootout excluded. Plays with an unusable clock are dropped and counted.
- Time axis: periods 1-3 are 1200 s, OT is 300 s in the regular season and 1200 s in the playoffs (game type 3); intermissions take no axis time.
- Strength: `sit` = away goalie, away skaters, home skaters, home goalie. Empty net (goalie 0) removes the extra attacker from the count. A power play needs both sides >= 3 skaters and different counts; other codes draw nothing. `sit` exists only on plays, so band edges are accurate to the nearest recorded event; start is back-dated to a penalty by the shorthanded team since the previous play; end is capped by the penalty minutes inside the band when all durations are known.
- Not possession, not zone time, not xG, not a forecast. Goal-prone situations (empty net, 6v5) are not adjusted.
- Missing data: no plays => "No play-by-play yet" (series null); no x/y => no multiplier; no `sit` => no bands; values are never NaN.

## Incremental engine
`createFlow(opts).push(plays).series()`: running sums over an expiring window (A = sum w, B = sum w*te; value = A - (t*A - B)/window), samples before the newest play are final, the tail is recomputed per call without mutating state. Plays dedupe by id; identical repeats are ignored; a changed or out-of-order play triggers one rebuild. Property tests compare it with direct summation over the real fixture and a replicated 456-play history at several chunk sizes.

## Pane
Timeline with HOME above the centre line (solid) and AWAY below (hatched), period boundaries, goal markers, penalty markers, power-play bands, period zoom buttons, slider inspect (arrow keys, Home/End) and pointer/tap, a readout like "P2 08:20 — EDM +0.42 pressure", `role=img` with an `aria-label` that carries the generated text alternative, a visible per-period table, "How this is calculated", and for completed games an optional separate MoneyPuck xG line (`chanceFlow`, never mixed). No animation. Test id `momentum-chart`.
