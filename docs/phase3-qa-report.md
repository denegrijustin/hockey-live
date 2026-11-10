# Phase 3 QA report (independent validation)

Branch `claude/p3-qa` (from `claude/phase2`, Phases 1-4 merged). Nothing deployed or pushed. Other agents' reports were not relied on; everything below was run here.

## What was run

| Check | Command | Result |
|---|---|---|
| Node unit suite | `node --test tests/*.test.mjs` | 396 / 396 pass (incl. 11 new in `tests/p3-integrity.test.mjs`, 1 new in `standings-view.test.mjs`) |
| Types and build | `npx tsc -b`, `npx vite build`, `node scripts/check-budget.mjs` | clean; main chunk 394.6 kB, 126.9 kB gzip of the 135 kB budget |
| Existing Phase 3 browser specs (team-page, team-profile, player-profile, search, standings-views, standings-players, trends, injuries, request-duplication) | `vite preview` on port 4207, desktop + mobile projects | 133 passed, 9 skipped (desktop-only by design) |
| Re-run after fixes (search, mobile-fit, standings*, trends, team*, player-profile, phone-controls) | same | 123 passed, 19 skipped |
| New QA spec `tests/browser/p3-qa.spec.ts` | desktop project, viewports set inside tests (390, 360, 1280) | 10 / 10 pass |

Screenshots (looked at: standings light 360, team page 360, injuries light 360, long-name player 360, search light 360, matchup lens light 360; the rest generated, not all inspected): `/tmp/claude-0/-home-user-hockey-live/4e18fd4c-d9f5-58f4-a367-d2a96a19330f/scratchpad/p3-qa-shots/`.

## 1. Data integrity (independent recomputation)

`tests/p3-integrity.test.mjs` recomputes everything from the raw games in `public/data/seasons/20252026.json` (complete season, 1312 regular-season games) and `20262027.json` (current, 282 played) with code that shares nothing with the app helpers, for all 32 teams on both snapshots:

- Table (GP, W, L, OTL, PTS, GF, GA, RW) from `analyzeSeason`, ROW from `withRow`, P% from `pointsPct`; league goals for = goals against. No disagreement.
- League order from `compareStandings` (P%, RW, ROW, goal difference, name) and `teamRanks` league rank. No disagreement; comparator antisymmetric.
- `wildCardGroups` (3 per division + 2 wild cards + rest, both conferences) and `gapToLine` (status, reference team, point gap, P% gap). No disagreement.
- `teamSummary`: record, points, P%, GF/GA, last 5 / last 10 (points, size), form, streak, home + away splits sum to the overall record (GP, points, goals), standings-row streak and last 10. No disagreement.
- Trends (`teamResults`, `formLast(10)`, `goalDiffTrend`, `homeAwaySplit`, `streak`) against raw type 2+3 games: counts, last-10 record and points, cumulative goal difference, home/away split. No disagreement with `docs/phase3-trends.md`.
- `clinchStatus`: matches an independent implementation of the documented rule at 5 truncations of the full season (50 / 75 / 85 / 92 / 97 %), and a Monte-Carlo soundness check (1500 random play-outs, ties counted against the team for clinch and for it for elimination) found no unsound clinched or eliminated label.
- Injuries (fixture feed, 17 items): output statuses equal the provider's statuses exactly (Injured Reserve, Day-To-Day, Out, Suspension); none invented; "Not reported" only when the feed has none; `Reported return date (estimate)`, `Return date has passed`, `No return date reported` text come from the report's own date; vague parts map to "Upper body (not specified)", "Lower body (not specified)", "Not specified" (neutral pose), personal/illness separate.
- Search ranking: `nyi` -> Islanders first, `montréal` -> Canadiens (diacritics), nonsense -> explained empty state, a player not loaded (Gretzky) is not invented, markup text is inert.

## 2. Edge cases (browser, `p3-qa.spec.ts`)

Passing: `?team=XXX` (home view, no team UI), `?view=teams&team=XXX`, an `<img>` payload and lowercase `edm` team ids; `?player=1234567` with a 404 (dialog says "could not be found", Retry and Close work, parameter removed on close), 500 ("unavailable"); malformed ids (`abc`, `123`, 8 digits, markup, trailing space) never open a dialog and never fetch; team page with no games and no roster feed (CBJ at 360, no NaN/undefined/null text, no overflow); player with every stat null and no team roster; 70-character hyphenated player name at 360 (no page or dialog overflow); offline while a profile is open (content stays, Escape still closes, no uncaught error). Postponed games: not counted in table/summary/trends (unit); see defect 1 for clinch.

## 3. Accessibility (360 and 390, dark and light)

Passing: every visible interactive element on the team page (all sections open), standings (4 viewport/theme combos), search dialog, matchup lens, injuries and the team dialog has an accessible name; images have `alt`; no sideways scroll anywhere; no text below WCAG AA contrast (own luminance check, 0 hits in all views); player dialog keeps focus inside, Escape closes and returns focus to the roster button; team dialog the same from a standings link; search palette focus trap / Escape / return (existing spec plus mine); standings radiogroups have arrow-key roving focus and exactly one tab stop; every standings table has a caption or label; Current/Projected are `aria-checked` radios and Standings/Resumés are `aria-pressed`; reduced motion: no infinite animation running with the palette open.

## 4. Performance

- Main chunk 126.9 kB gzip (budget 135). `TeamPage` (17.7 kB), `PlayerProfile` (12.3 kB), `SearchDialog` (6.8 kB), `Standings`, `Trends`, `Injuries`, `TeamComparison` are separate lazy chunks; the search index builder does not ship `SearchDialog`.
- Opening a team page: manifest, 2 season snapshots (current + previous for splits), live, league matchups once each, roster and injuries only when Roster opens, 0 duplicate API requests. Opening a player: `/api/player/<id>` and its log once each; the club roster is requested a second time by the profile (see low defect 4). Search: 0 requests while typing; no duplicate requests.

## 5. Cross-links

Standings team link -> team dialog -> full page; team page -> roster player -> profile -> its team (button "Edmonton Oilers") -> team; injuries -> team (always) and -> player (only when matched on the roster, by design); search -> team (opens the page), game (today's), player (loaded), page; team page schedule rows and next game open the Game Center (existing spec, re-run green).

## Defects

Fixed (with tests):
1. **Clinch/elimination could be claimed too early.** `clinchStatus` ignored postponed and suspended games as "remaining", so a team with an unrescheduled postponed game had its maximum points understated. Now only canceled games are excluded (`src/lib/standings-view.mjs`, test in `tests/standings-view.test.mjs`). Latent on the shipped snapshots (no postponed games), but the labels must never be unsound.
2. **Same page, two streaks.** The team page Overview ("L5", OTL its own run) and Team intelligence chip ("L7", games without a win, incl. playoffs) disagreed for TOR 2025-26 and 6 teams in 2026-27. The chip now reads "Without a win: 7 games" with a tooltip stating the difference (`src/components/trends/TeamIntel.tsx`).
3. **44 px targets in the search palette on phones.** "Esc" close button was 42x32 and the input 40 px; now 44 (`src/search.css`, max-width 720 px).

Remaining (not fixed):
4. Low: the club roster `/api/players/<season>/<team>` is fetched by the team page and again by the player profile in the same session (worker sends `max-age=300`, so the second is normally a browser cache hit; no in-app memo).
5. Low/design: inline team-name links (`.team-link`) are 15 px high in standings rows and injury cards, injury team chips are 36 px, "Iceboard home" header link 30 px. They sit below the 44 px rule; enlarging needs a hit-area approach that does not make adjacent links in dense tables overlap.
6. Info: the Standings STRK column sits against the right edge at 360 px (no scroll, readable).
7. Info: in the Overview the streak type "OTL" and the Standings table "OT" label the same thing differently; the standings table, team page and trends chip now have three documented streak definitions.
8. Info: roster row for a player with all-null stats puts the follow star under the name at 360 (fixture-only case).

## Unverified

Real-device touch and VoiceOver/TalkBack behaviour (only Chromium headless with keyboard emulation); Firefox/WebKit; real live `/api/player` and `/api/injuries` responses (fixtures and mocks used, no network provider); the Worker routes themselves (preview server serves static only); `?player=` through service-worker offline cache (SW blocked in tests); screenshots not individually inspected for the generated-but-unlisted files; the Monte-Carlo clinch soundness uses points only (no tie-break arithmetic) by design.
