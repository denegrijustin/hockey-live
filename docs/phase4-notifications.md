# Phase 4: game alerts (Stage A, in-app only)

## What exists
- `src/lib/alerts.mjs` (pure, tested in `tests/alerts.test.mjs`): `diffGames(prev, games, now)` returns `{events, next}`; `relevantEvents(events, prefs)`; `coalesce`; `createAlertStore(storage)` (seen-set + list in key `iceboard-alerts-v1`, cap 300 ids / 60 items, 3-day TTL, in-memory fallback, tiny `iceboard-alerts-lock` so only one tab records an event).
- Events: `${id}:start`, `${id}:p${n}${REG|OT|SO}:begin|end`, `${id}:final` (title tagged OT/SO), `${id}:PPD|CNCL|SUSP`. No score-change events: the scoreboard feed only has running totals per poll, which cannot reliably say who scored or whether a goal was reviewed.
- Rules: first snapshot is a silent baseline; stale-live games and score decreases never alert; a game not in the previous snapshot never alerts; default is OFF (`prefs.alerts.enabled`), and switching on starts a fresh baseline; followed players only yield "X plays tonight" at puck drop (an availability fact).
- UI: `NotificationBell` (header, shown when alerts are on, name "Notifications, N unread"), lazy `NotificationCenter` sheet, lazy `AlertToast`, `AlertSettings` (export for Settings > Notifications), `useGameAlerts(scoreboard.games)` in App (reuses the existing `/api/live` poll; no new polling).
- Device notifications: only after the explicit "Enable device notifications" click, only while the page is open; shown through the service worker registration `showNotification` if present, else `new Notification`, with `tag` = event id.

## What is NOT built: Web Push
The Worker is a stateless GET-only proxy, so alerts cannot arrive while Iceboard is closed. Background push would need: a VAPID key pair (secret), a KV (or similar) subscription store, POST routes (`/api/push/subscribe`, `/unsubscribe`) with abuse limits, a cron-triggered fan-out that runs the same diff server side and sends encrypted Web Push, and a `push` + `notificationclick` handler in `public/sw.js`. The UI states "Alerts appear while Iceboard is open. Background push is not available."

## Limits worth knowing
- Schedule alerts only cover games present in the live scoreboard (today's slate).
- Tabs hidden for a long time (the poll pauses) resume with one diff; more than 3 events collapse to "N updates".
