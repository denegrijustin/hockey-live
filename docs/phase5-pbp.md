# Phase 5: Play-by-Play (Agent 3)

Files: `src/components/gc/PlayByPlay.tsx` (default export, reads `useGameCenter()`), `src/components/gc/pbp.css`, `src/lib/pbp.mjs` (pure, tested in `tests/pbp.test.mjs`), `tests/browser/gc-pbp.spec.ts`.

## Behaviour
- Rows: `<ol>` per period, `data-testid="pbp-event"`, `data-event-id`, `id="ev-<eventId>"`, React key `${gameId}:${eventId}` (append-only; rows are memoised, `playsSignature` = length + last order/id + goal assists/score so an identical poll does no work).
- Order: events sort by `order` (NHL sortOrder); missing order/time/period sort last. Default is chronological for finals/upcoming and **newest first while live**; the "Newest first" toggle (`pbp-order`) overrides.
- Filters (aria-pressed chips `pbp-filter-<key>`): all, goals, shots (SOG, missed, failed attempt), penalties, hits, blocks, faceoffs, turnovers (giveaways/takeaways), stoppages, other (unknown types are never dropped). Team: `pbp-filter-team-all | team-<ABBR> | team-neutral` (events with no team).
- Jump: `pbp-next-goal`, `pbp-prev-goal` (wrap), goal chip list `pbp-goal-list`, period buttons `pbp-period-<P1|P2|P3|OT|SO>`.
- Importance: goals bold/prominent, penalties medium, shots/blocks routine, rest low.
- Goals show scorer, assists (or "Unassisted"), goalie, "Goal n" and score after. Score after is Official when the feed has `score`; otherwise a running count of goals (shootout excluded, disallowed skipped) labelled **Derived**.
- Strength badge decodes `situationCode` "ABCD" (away goalie, away skaters, home skaters, home goalie): equal skaters with both goalies in = 3v3/4v4/5v5; unequal skaters from the event team's view = "Power play 5v4" / "Penalty kill 4v5"; a 0 goalie digit = "Empty net"/"Both nets empty" with skater counts; anything else (bad code, skaters outside 1-6) shows no label. Shown on goals, and on penalties when not even. It is the strength when the event happened.
- Players link through `usePlayerProfile` (roster supplies team/number/headshot); teams through `TeamLink`. Hits: hitter then "on" hittee; blocks "blocked by"; faceoffs winner "vs" loser; penalties "drawn/served by" (the feed does not say which).
- `focusEvent` prop (optional; Agent 1's UI context should pass it) or `event=` in the URL (read at mount and on `popstate`) scrolls to, highlights and focuses the event; a hiding filter is cleared first. Reduced motion uses instant scroll.
- Optional event-store fields on `useGameCenter()`: `voided` (ids or play objects; objects not in `plays` are merged back in order) shows a struck-through "Disallowed" row that does not count in goal numbering; `changed` shows an "Updated" badge. Absent = nothing shown.
- Performance: rows use `content-visibility:auto` with `contain-intrinsic-size`; tested with 400 events.
- States: loading, error (no data), no plays, no filter match (with reset). The stale banner and live announcements belong to the header; this pane has no live region.

## Integration notes for the lead
Mount as `<PlayByPlay focusEvent={ui.focusEvent} />` inside `GameCenterProvider` (lazy import; panes stay mounted so hidden-pane scrolling retries for ~30 frames). The spec uses the `Play-by-Play` tab if it exists.

## Test fixture (derived)
`gc-pbp.spec.ts` builds its feed from the real `tests/fixtures/raw-live-game.json` via `normalizeGameFeed`. Because the recording has zero goals and one period, the builder (only) relabels three real shot-on-goal plays as goals with real roster players as assists and running score after, and moves later plays into periods 2 and 3. These are derived and never appear in the app.
