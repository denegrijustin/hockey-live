# Phase 4 report: Personalization, Favorites, Alerts & Fan Experience

Branch `claude/phase2` (pushed; nothing deployed, no PR opened). Phases 1 to 4 are all on this branch.

## A. Executive summary
- Favorites, followed players and saved games, one versioned device-local preference record, a Settings view, in-app alerts, a personalized Home, and PWA/mobile fixes.
- No accounts exist (the Worker is a stateless GET-only proxy), so everything is device-local and the UI says so. No auth, backend or dependency was added.
- New-visitor default is the whole league (the old hardcoded EDM/CHI/MIN is gone); existing users' `iceboard-teams` selection is migrated into favorites.
- Main JS chunk 122.5 of 135 KB gzip, CSS 30.3 of 32 KB (PWA agent lazy-loaded about 11 KB of existing code to make room for the store).

## B. Subagent results
| Agent | Delivered | Branch |
|---|---|---|
| 1 Favorites | useFavorites, FavoriteStar/Mark, optional dismissible Onboarding, stars on team page/dialog/directory/standings/schedule/cards, favorites-driven team selection | p4-favorites |
| 2 Players | follow button (profile, rows, search), shared 32-roster cache, Following > Players watchlist (skater/goalie split, trade/no-roster/missing-stat states, injury badge by name+team only), search now has players | p4-players |
| 3 Home | My teams, My players, League Pulse, dedupe rule, density, order, section toggles | p4-home |
| 4 Alerts | pure diff engine with deterministic event ids, seen-set, tab lock, bell, notification center, toasts, AlertSettings | p4-alerts |
| 5 Games | relevance score with explanation, Save game, Following > Games, Recommended | p4-games |
| 6 Settings | Settings view, display prefs (theme, contrast, motion, text size, time zone, 12/24h), formatters, reset with confirm, boot.js first paint | p4-settings |
| 7 PWA | maskable icon, richer manifest, build-hashed SW cache (still one SW, /api excluded), install card, online/offline events, offline banner | p4-pwa |
| 8 QA | harness (prefs/fixtures/qa-harness), 8 new specs, worker param hardening (2 defects fixed), final-wave validation (layout-shift fix, null-stat crash fix) | p4-qa |

Lead: preference store and contracts, shell wiring, all merges, spec repairs, header overflow fix, Players default, season label fix.

## C. Personalization architecture
Key `iceboard-prefs-v1` (`src/lib/prefs.mjs` pure + `prefs.ts` store): favorites (team abbreviations, max 32), players (7-digit NHL ids, max 100, display snapshot only), games (numeric NHL ids, max 100), display, alerts. Sanitised against allow-lists on every read and write; corrupt data falls back to defaults; blocked storage keeps an in-memory copy and Settings says nothing is being saved; other tabs follow via the storage event. Reset clears only Iceboard's keys after a confirm. Sync is not possible (no accounts); preferences are per browser.

## D. Notification architecture
In-app only. Events: game start, period end/begin (incl. OT/SO), final (OT/SO tagged), postponed/cancelled/suspended. No score-change alerts (the feed gives only running totals). Ids are deterministic, a persisted seen-set (300 ids, 3 days) and a cross-tab lock prevent duplicates, the first snapshot is a silent baseline, stale-live games never alert, off by default. Optional local `Notification` only after an explicit click and only while the page is open. **Web Push is not built and is not claimed**: it needs a VAPID secret, a subscription store, POST routes, cron fan-out and an SW push handler (`docs/phase4-notifications.md`). The device-notification path has not been exercised by any test.

## E. Mobile and PWA
Verified in Chromium emulation at 390x844, 360x740, landscape 844x390: no sideways scroll, nav/search/bell reachable. Manifest fields and icon pixel sizes checked by spec. NOT verified: real iOS or Android installs, maskable cropping, notch insets, iOS cache eviction, a real permission prompt, real Cloudflare headers (`docs/phase4-mobile-pwa.md`).

## F. Regression testing
- Unit: 384 pass, 0 fail. tsc clean, build OK, budget OK.
- Browser (Agent 8, merged tree): 973 passed, 90 skipped, 7 failed; 6 pass alone (load-sensitive), 1 real layout shift fixed. My own full run before the final fixes: 972 passed, 8 failed (3 real: Players empty without favorites, fixed; 5 flakes passing alone).
- After the last small CSS/header changes only targeted specs were re-run (98 passed); the complete suite was not run again after those.
- Accessibility: 44px targets, aria-pressed, dialog focus return, names checked by specs on the new UI; no screen-reader testing, light theme mostly checked via screenshots (7 viewed).
- Security: no secrets in dist/worker/wrangler, CSP headers asserted, hostile query params do not execute, two worker param-validation defects fixed. Open: no per-id rate limits on /api/player, /api/boxscore, /api/game (needs Cloudflare rules); `league-matchups?refresh=1` ungated.

## Known issues
- My Players on Home uses an inline adapter rather than the watchlist summaries (same data, duplicate logic).
- Home order/sections/density apply only with favorites (by design: no-favorites Home is unchanged).
- The Games team picker selection is session-only; only favorites persist.
- Browser Back does not close dialogs (pre-existing).

## G. Phase 5 opportunities
Account sync (needs auth + KV), real Web Push, per-id API rate limits, score-change alerts via per-game feeds, favorite-aware standings views, share links for favorites, real-device PWA validation, mascot poses for COL/MTL/SJS.
