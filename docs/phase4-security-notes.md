# Phase 4 security and performance notes (QA, Wave 3 portion)

Scope: `src/worker.js`, `public/_headers`, `wrangler.toml`, the built bundle, URL parameters. Tests: `tests/worker-security.test.mjs`, `tests/browser/security-headers.spec.ts`, `tests/browser/xss-params.spec.ts`.

## Worker (src/worker.js)

| Check | Result |
|---|---|
| Non-GET | Every `/api/*` request that is not GET returns 405 before any routing (`handle`). Tested for POST/PUT/DELETE/PATCH on live, player and the MoneyPuck manual-refresh route. Nothing is written to KV by any client request except bounded caches of data the Worker itself fetched. |
| Path ids | Every route pattern is anchored (`^...$`) with fixed-width digits/uppercase letters: season `20\d{6}`, game `20\d{8}`, player `\d{7}`, team `[A-Z]{3}` then checked against the allow-list of 32 ids, MoneyPuck shots id `\d{10}`. Encoded traversal (`%2f`, `%00`, `%0a`), lowercase teams, extra segments and wrong lengths all fall to 404 without a KV read or upstream call (tested). KV keys are built only from validated digits/ids, so key injection is not possible. |
| Seasons | edge, league-matchups, moneypuck and season routes check the season against `manifest.json`. |
| Errors | All failures return generic JSON (`502 "NHL data is temporarily unavailable"`), no upstream body, no stack; `X-Content-Type-Options: nosniff` on JSON replies. |
| Secrets | None in `wrangler.toml` (the KV namespace id is an identifier, not a credential), nothing in `src/worker.js`; no `.env`, `.pem`, `.key`, `.dev.vars` tracked; regex scan of `dist/` for AWS/OpenAI/GitHub/Slack tokens, private-key headers, `api_key=`, `Bearer` strings found nothing. Bundle URLs are only NHL, ESPN, MoneyPuck, sportslogos.net (citation links) and w3/react.dev namespaces. No localhost or sourcemap references. |

### Defects found and fixed (minimal)
1. `GET /api/team-stats?team=EDM&season=<anything>`: `season` was used unvalidated in the KV key `${team}-${season}`. Read-only, so low impact, but it allowed arbitrary key probing. Now requires `^20\d{6}$`, else 400.
2. `GET /api/players/<season>/<TEAM>`: accepted any `20\d{6}` season, so a client could make the Worker call the NHL API and write KV entries (24 h TTL) for seasons the app does not publish (cache/upstream abuse, cost). Now checks the season against `manifest.json` like the sibling routes, else 400.

### Residual risks (not changed, for the lead)
- `/api/player/<7 digits>` and `/api/player/<id>/log/<season>`, `/api/boxscore/<id>`, `/api/game/<id>` accept any well-formed id and call the NHL API, writing 1 h-TTL KV entries (profile/log). A scripted client can enumerate ids; bounded by the digit pattern and TTLs but not rate limited. Cloudflare rate-limiting rules (dashboard, no code) are the proper control.
- `?refresh=1` on `/api/league-matchups` bypasses the cache and triggers an upstream refresh for any visitor (the MoneyPuck refresh has a 60 s gate; league-matchups does not). Consider the same gate.
- `/api/espn/<date>` takes any `20\d{6}` (not validated as a calendar date); it only builds an ESPN query string from digits.

## Headers (public/_headers)
Verified statically (and in the served app by a no-CSP-violation load): `nosniff`, `X-Frame-Options: DENY`, `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, `script-src 'self'` and `connect-src 'self'` (no wildcard, no `unsafe-inline`/`unsafe-eval`, no `data:`/`http:`), `img-src` limited to self plus `assets.nhle.com`, `a.espncdn.com` and `data:`. `style-src 'unsafe-inline'` remains (React inline styles); acceptable since script injection is blocked. The test also fails if `dist/index.html` gains an inline script (Agent 6's boot script for theme must be an external file or the CSP needs a hash; **lead: check this at integration**, the spec will report it).

## URL parameters
`?view`, `?team`, `?player`, `?date` are read only through allow-lists (`VIEW_IDS`, `teams.some`) or used as text, never as HTML. 8 hostile payloads (markup, `javascript:`, template injection, encoded markup, traversal, 5 kB string) x 5 parameter combinations, both viewports: no script execution, no injected `img[onerror]`/`script`/`javascript:` href, no CSP violation, no uncaught error, nothing reflected in visible text.

## Performance notes
- Home load request counts (desktop, saved data, `request-duplication.spec.ts`): every URL is requested exactly once (about 36 same-origin requests, mostly lazy chunks and logos); `/api/live` once at load. Guard: <= 2 per URL (3 for `/api/live`), <= 60 total. The spec prints the table.
- Polling: one shared timer per URL; hidden tabs make no requests and a show triggers one catch-up fetch (`visibility-polling.spec.ts`); a persistent outage stays at the 30 s cadence with at most one request in flight (`network-flaky.spec.ts`).
- Placeholder (final wave): personalization cost (`relevance()` over a day's slate with 32 favorites, 100 players, 100 saved games) is a `test.fixme` in `request-duplication.spec.ts`, waiting for `relevance.mjs`/`home-pulse.mjs`.
