# Phase 4 independent QA report (merged claude/phase2 + QA branch)

Everything below was run against the merged app (`npx vite build`, `vite preview` on 4218/4219), desktop 1440x1000 and mobile 390x844 (plus 360x740 for fit and screenshots). Nothing is taken from the other agents' reports.

## What was run
| Run | Result |
|---|---|
| `node --test tests/*.test.mjs` | 384 pass, 0 fail (includes new `worker-security`, `relevance-perf`, `signed()` tests) |
| `npx tsc --noEmit` | clean |
| Build + `scripts/check-budget.mjs` | all files within budget; main chunk `index-*.js` 126.9 KB gzip of 135 KB (after the Onboarding change below) |
| Full browser suite, merged app, 3 workers (1070 tests) | 973 passed, 90 skipped, 7 failed. Re-run in isolation: 6 of the 7 pass (load-sensitive timeouts in compact, game-injuries x2, injuries x2, network-flaky); 1 was a real defect (CLS, below), now fixed |
| New/changed specs after fixes, both projects | 133 passed, 9 skipped (8 screenshot tests that need `P4_SHOTS=<dir>`, 1 desktop-only skip of the 44px touch-target check), 0 failed |
| 90 skipped in the full run | pre-existing conditional skips in other agents' specs (not investigated one by one) |

## Coverage of the checklist (what proves it)
1. Favorites: add/remove on the team page, `aria-pressed`, persistence after reload, standings marker with accessible "Favorite" text, onboarding banner skippable and not shown again, no favorites = 32 teams on Games/Players/Home, "All 32" one tap (`favorites.spec`, `home-personal`, `storage-resilience`, mine: `multi-tab` star sync).
2. Followed players: follow from profile and search, Following > Players, skater vs goalie, missing stats (dashes), traded, no-roster (`following-players.spec`; I looked at the 390px screenshot: "Not on a current roster", dashes, "Plays tonight vs CHI").
3. Saved games: card and Game Center, Following > Games, postponed/removed states, Recommended explanation (`following-games.spec`).
4. Home personalization: My teams dedupe, density, order, section toggles, default Home unchanged without favorites (`home-personal`, `home-sections`).
5. Alerts: off by default with no bell, one alert per event, reload adds no duplicate (`alerts.spec`). Mine: Settings > Notifications actually renders `AlertSettings` in a real browser (master switch unchecked, categories/scope fieldsets disabled until on, permission text honest, "Alerts appear while Iceboard is open. Background push is not available.", persists and opt-out works); Settings > Application renders About, `InstallCard`, Data, Privacy, Reset; two-tab record check keeps `iceboard-*` keys only.
6. Settings: sections, persistence, reset confirm (`settings.spec`); mine: reset dialog and picker sheet return focus to their trigger on Escape. Storage blocked (SecurityError and QuotaExceeded) and 9 kinds of corrupt records all render with defaults (`storage-resilience`).
7. Previously skipped: `multi-tab` favorite-star test now runs and passes on both projects (a favorite toggled in tab A shows in tab B through the `storage` event and back). The personalization-cost placeholder is now `tests/relevance-perf.test.mjs`: 16 games, 32 favorites, 100 saved games, median 0.05 ms, p95 0.15 ms (asserts < 10 ms / < 50 ms).
8. Accessibility and hygiene: all 14 views load with favorites + 5 followed players + 2 saved games and no console errors, CSP violations or sideways scroll at 390px (both projects); favorite star >= 44x44, save button >= 44px, every Settings control >= 44px on the phone project; dialogs name and focus return as above; Home with everything on requests every URL at most twice (actually once each: `/api/live` 1x, `/api/season/<id>` 1x, previous season 1x).

## Screenshots (looked at)
`/tmp/claude-0/-home-user-hockey-live/4e18fd4c-d9f5-58f4-a367-d2a96a19330f/scratchpad/p4-shots/` (28 images: Home, Following, Settings and its Display/Notifications/Application sections, Team page; 390x844 and 360x740, light and dark). Viewed: Home 390 dark, Settings 360 light, Notifications 360 light, Application 390 dark, Following 390 light and 360 dark, Team 360 dark. Layout, contrast and wrapping were fine in all of them; disabled alert options are visibly dimmed.

## Defects found and fixed
1. **Layout shift 0.16 on first Home load (phone, new visitor)**: the onboarding banner was a lazy chunk with a null fallback, so it popped in above the board after the data and pushed everything down 154 px (`home-perf` failed deterministically). Onboarding is now a normal import in `App.tsx` (+0.3 KB gzip); `home-perf` passes 4 of 4 runs.
2. **Players view crashed on a missing stat**: `signed()` in `src/lib/model.mjs` called `.toFixed` on null; the error boundary caught it but the view was lost. It now shows a dash. Test in `tests/model.test.mjs`. (The shipped roster files contain no nulls, so this only matters if the feed ever does.)
3. Earlier in the wave: Worker `team-stats` season validation and the `players` season manifest check, `IntermissionRink` storage hardening (see `phase4-security-notes.md`).

## Defects remaining (not fixed)
- Header season select shows only "20" on phones (`src/search.css`: `.header-right .season-label select { max-width: 64px }` clips "2026-27"); pre-existing since Phase 2, cosmetic, but worth a short label.
- Home with followed players but no roster loaded shows ids ("P8470001") until the roster resolves (mock data names in my screenshots; real behavior with names depends on the stored snapshot name, which the follow action stores).
- No rate limit on enumerable player/game ids and an ungated `league-matchups?refresh=1` (see security notes).
- The 90 skipped tests in the full run were not audited individually.

## Unverified
- Real notification permission grant/deny (headless cannot answer the browser prompt; only the text for the default state was observed).
- Real Cloudflare headers (static `_headers` file only) and the service worker on an installed PWA.
- Real NHL data end to end (all runs use the saved snapshot or mocks); real-device Safari/Firefox.
- Timing-dependent specs (network-flaky, visibility) use a fake page clock with a real network and were stabilized with retries; they can still be sensitive on a very loaded machine.

## How to re-run
`npx vite build`, then `WT=$PWD PORT=<p> node node_modules/@playwright/test/cli.js test -c <config copied into the worktree root> --trace off <specs>`; screenshots with `P4_SHOTS=<dir>`. The config's web server must use `npx vite preview` (pnpm aborts without a TTY).
