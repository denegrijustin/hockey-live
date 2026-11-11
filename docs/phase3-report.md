# Phase 3 report: Team Intelligence, Player Profiles, Standings & Advanced Discovery

Branch `claude/phase2` (pushed; nothing deployed, no PR). Phases 1 to 4 are all on this branch. A short Phase 2 summary is at the end, because its report was never written separately.

## A. Executive summary
- Full team pages, global player profiles, richer standings, an injury report that reports only the provider's words, form/trend panels and a Game Center matchup lens, and a global search palette, all linked together (no dead ends).
- No fabricated data: every derived number carries a documented definition and sample label; missing values show a dash; clinch/elimination labels are computed from points only and omitted when unsure.
- Final verification on commit `eac55f7`: unit 396/396; full browser suite 1005 passed, 0 failed, 105 skipped; tsc, build and budget clean (main JS 122.5 of 135 KB gzip, CSS 30.3 of 32 KB).

## B. Subagent results
| Agent | Delivered | Notes |
|---|---|---|
| 1 Team | `?view=teams&team=ID` page (Overview, Performance, lazy Roster/Schedule/Team intelligence), quick-peek dialog kept, `team-summary.mjs` | roster loads on first open |
| 2 Player | global player dialog, skater/goalie layouts, last 5/10, `/api/player/:id` extensions and `/api/player/:id/log/:season`, `?player=ID` deep link | worker KV key bumped to `profile-v2-` |
| 3 Standings | League/Eastern/Western/Divisions/Wild Card, Current/Projected, P%, L10, STRK, GIH, spot pill, computed clinch labels, NHL-style tiebreaks (points %, RW, ROW, GD) | sort now by points %, not points |
| 4 Injuries | provider status verbatim, "Reported N ago", "No return date reported", estimate tag, neutral pose for vague body parts, player links only on a single exact roster match | no new artwork; COL/MTL/SJS still neutral |
| 5 Trends | `trends.mjs` (form, GD, home/away, special teams only from real data, matchup lens), TeamIntel, MatchupLens in the Game Center | definitions in `docs/phase3-trends.md` |
| 6 Search | Ctrl/Cmd+K and "/" palette: teams, games, players (loaded data only), pages; ranked, accessible, lazy | players wired in Phase 4 |
| 7 QA | independent recomputation of standings/summary/trends from raw snapshot games for all 32 teams (no disagreement), 10 browser specs, 12 unit tests; 3 defects fixed | `docs/phase3-qa-report.md` |

Lead: contracts (`docs/phase3-contracts.md`), merges and conflict resolution, global open-game listener, header overflow fixes, spec repairs.

## C. Feature inventory
Team pages and dialog; player profiles; standings views; injury report; Team intelligence panel; Game Center "Form and matchup lens"; search palette; `openGame(id)` from anywhere; `?team=` and `?player=` deep links with validation (bad ids fail safely).

## D. Navigation improvements
Phase 1 tab bar/sidebar/More kept; team and player pages are real history entries (Back works); every profile links to its team, games, standings and injuries; search reaches every kind of destination.

## E. Data integrity
Independent recomputation found no disagreement. Fixed by QA: clinch labels counted postponed/suspended games wrongly (latent), two different "streak" figures on one team page (chip renamed "Without a win: N games"), search targets under 44px. Injury statuses are never invented; ESPN ids are never treated as NHL ids; ambiguous matches show no link.

## F. Validation
Unit 396/396. Browser: 1005 passed, 0 failed, 105 skipped (conditional skips by project/environment). Earlier full runs had load-sensitive flakes that pass alone; real defects found by the suite were fixed (header overflow from the new Search button, 44px targets, a Players default). Accessibility: names, focus return, radiogroup keyboard, captions and contrast checked by spec on Chromium; 6 QA screenshots viewed.

## Known issues (not fixed)
Inline team links in dense tables are about 15px tall; STRK cramped at 360px; three documented streak definitions; follow star wraps in a null-stat roster row; roster fetched twice (browser cache hit); Back does not close dialogs; per-id API rate limits and the `league-matchups?refresh=1` gate are missing.

## Unverified
Real iOS/Android devices, VoiceOver/TalkBack, Safari/Firefox, live Worker routes against real NHL data (preview serves static files only), service-worker offline for deep links.

## G. Phase 4 recommendations (done in Phase 4; see `docs/phase4-report.md`)
Favorites, followed players, saved games, alerts, settings, PWA. Next: real-device checks, the open defects above, per-id rate limits.

## Phase 2 summary (homepage, cards, discovery)
Home sections (Live, Upcoming, Worth watching, Completed, Postponed, League intelligence), `GameCardView` variants, Eastern-day date strip and schedule navigation, deterministic matchup insights, Games filters by Eastern day. Validated in the Phase 2 full run (715 passed, 5 failed at the time: an ET date in a spec, a stale-live fixture, the date-strip scroller check, all fixed) and in every later full run. Details: `docs/phase2-contracts.md`, `docs/phase2-qa-report.md`.
