# Phase 5: Game intelligence (Matchup Intelligence tab)

Code: `src/lib/game-intel.mjs` (pure), `src/components/gc/IntelPane.tsx`, `src/components/gc/intel.css`. Tests: `tests/game-intel.test.mjs`, `tests/browser/gc-intel.spec.ts` (fixtures derived from real recorded data, see `tests/fixtures/derive-intel.mjs`).

Every item is `{id, kind, phase: pre|live|post, priority, text, detail, basis, link?}`; every sentence is built from the numbers shown in `detail`. Basis labels: Official (stated by the NHL feed), Derived (counted or computed by Iceboard), Historical (season-to-date results), Projection (what-if arithmetic on the pregame table, not a forecast).

| Item id | Definition | Inputs | Limits |
|---|---|---|---|
| first-goal | first regulation/OT goal | goal plays | none |
| lead-changes | goals that put the trailing team ahead (a tie in between counts once); ties = goals making a non-zero equal score | goals, `play.score` else running count | shootout goals excluded; count that disagrees with the final score is refused |
| largest-lead | max margin, shown if >= 2 | same | |
| comeback | team that leads (live) or won (final) after trailing by >= 2 | same | |
| run-* | >= 3 consecutive goals by one team, with clock span in game time | same | |
| game-winner | goal after which the winner's total first exceeds the loser's final total | goals + final score | not for shootouts |
| one-goal / blowout | margin 1 / >= 4 | final score + matching goal count | |
| pp-now | current power play with skaters and the situation clock | feed `situation` (official) | live only; contradictory flags say nothing |
| penalties | count and minutes by penalized team | penalty plays with positive duration | power-play opportunities not counted |
| pp-goals | PP, short-handed and empty-net goals | `sit` code: away goalie, away skaters, home skaters, home goalie | PP needs both goalies in and more scorer skaters |
| special-teams-edge | one line of PP/PK ranks, edge named only at a net rank advantage >= 6 | league snapshot via `specialTeamsRank` | details stay in the Matchup lens |
| stakes-scenarios | win / OT loss / regulation loss: points and distance from the line | `scenario()` on the pregame table | needs both teams >= 10 GP |
| standings-*, clinch-* | `applyResult` on a copy of the pregame table; compares `gapToLine`, conference points rank and `clinchStatus` | `before[game.id]`, teams, season games | other games the same day are not applied; clinch is points arithmetic only (tiebreakers ignored), labelled "computed from points" |

Never produced here: season series, recent form, odds (they stay in insights.mjs / the Matchup lens). `buildIntel(game, {exclude})` drops any id or kind the host already shows.

Phases: upcoming = Pregame; live = Live plus Pregame context; final = Postgame; postponed/canceled/suspended = nothing.

## Integration
`<IntelPane before={before} teams={teams} allGames={allGames} exclude={insights.map(i => i.id)} />` inside `<GameCenterProvider>`; `before` is the per-game pregame table GameOverlay already has. The standings link is omitted (no navigation event exists); team links use `TeamLink`.
