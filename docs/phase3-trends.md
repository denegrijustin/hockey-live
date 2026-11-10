# Phase 3 trends: definitions

Source: `src/lib/trends.mjs` (pure, tested in `tests/trends.test.mjs`). Every metric returns `{value, sample, label}`; `value` is `null` (shown as "—") when fewer than 3 completed games back it (`MIN_SAMPLE`). Everything is descriptive of games already played; nothing is a prediction.

- **Completed game**: state OFF/FINAL, not postponed/cancelled, both scores present and different. Regular season and playoffs count. Upcoming, live, postponed and score-less games never count.
- **Result**: W = more goals; OTL = fewer goals and the game ended in OT/SO; L = fewer goals in regulation. Points: W 2, OTL 1, L 0.
- **formLast(results, n=5|10)**: the latest n results as W-L-OTL, points, chips and the current streak. Streak "W3" = 3 straight wins; "L2" = 2 straight games without a win (OT losses included, as in `insights.streakOf`). If fewer than n games exist the label says how many ("last 4").
- **goalDiffTrend(results)**: cumulative goals for minus against after each completed game; total and per-game mean. Label "season to date". Marked Derived.
- **homeAwaySplit(games, teamId)**: record, points % (points / 2 x games) and goal difference for games where the team was the home side and where it was the away side. A side with no games has points % `null`.
- **specialTeamsRank(snapshot, teamId)**: power-play % and penalty-kill % with league rank, taken only from the league matchup snapshot (NHL team summary). Not computed from games; null when the snapshot lacks them.
- **matchupLens(a, b, table, games, opts)**: bullets, each with `text`, `sample` and `numbers`: form (last 5, both teams), goal difference per game (standings table), home record vs road record (needs `opts.homeId`), special teams (power play vs penalty kill, only with a snapshot), season series (completed regular-season meetings). Bullets with too small a sample are omitted.

UI: `TeamIntel` (team page panel), `MatchupLens` (Game Center section "Form and matchup lens"), `FormStrip`, `GdSpark` (inline SVG with a text alternative), `SplitBar`, `TrendChip`. Styles: `src/trends.css`.
