# NHL Rivalry Feature — P0 Integration

## Scope

- 27 curated matchups identified by the same three-letter NHL team IDs as the Iceboard game model.
- Matchup label on schedule rows, compact cards and tiles via `GameCardView`.
- Expandable editorial history in the Game Center overview, with up to five recent *final* meetings from the **currently loaded seasons**.
- If a game has no curated rivalry, no history panel is added and existing score/watchability calculations remain unchanged.
- No network requests or media are required to render the feature.

## Integrity controls

**No all-time NHL W-L figures are shown.** Source-level aggregate snapshots from the separate research pack have different unknown cutoffs and cannot be certified as of 2026-11-14. The exported `verifiedAllTime` gate returns null unless a future record has a verified status, explicit display authorization, integer nonnegative fields and internally consistent game count.

Recent meetings are calculated from the app's own loaded schedule snapshots. Their heading deliberately says "available loaded seasons only"; these results are not described as historical all-time records.

## Official-results reconciliation

```sh
node scripts/audit-rivalry-records.mjs --from 2025 --to 2026 > /tmp/nhl-rivalry-audit.json
node --test tests/rivalries.test.mjs
pnpm test
pnpm build
```

The audit reads the NHL public club-schedule-season API, deduplicates games by NHL game ID, excludes unfinished games and anything after 2026-11-14, and computes independent regular-season and postseason counts for each pairing. It reports missing schedule requests as failures and leaves **every result provisional**. This is a *period-scoped audit*, not a substitute for an exhaustive 1917–2026 ledger.

To certify all-time records, a separate full historical results ingestion must cover each rivalry's intended era and exact franchise relocation policy, reconcile missing NHL schedule seasons with a trusted second source, audit ties and overtime-loss classification in historical rules, and cross-check opposite-team results. Only then should `validation_status: "verified"` and `display_allowed: true` be set.

### Historical data limitations

- Some older club schedule seasons may not be retrievable from the current NHL public endpoint. Missing seasons are not zero-game seasons.
- College-style rivalry trophies are not inferred from rivalry names.
- NHL team logos and historical photographs must undergo separate rights review before redistribution; no archival photos are added by this change.
- This branch intentionally does not modify deployment configuration or production data caches.

## Integration points

- `src/lib/rivalries.mjs` — mapping, snapshot recency, verification gate
- `src/components/Rivalry.tsx` and `rivalry.css` — UI
- `src/components/GameCardView.tsx` — schedule cards
- `src/components/GameOverlay.tsx` — Game Center overview
- `tests/rivalries.test.mjs` — matching and safety tests
- `scripts/audit-rivalry-records.mjs` — official schedule audit utility

This work is intended for review on a non-production feature branch.

## P1: live rivalry intelligence (2026-11-14)

`rivalryContext(allGames, game)` derives its statistics from the current Iceboard loaded NHL snapshots:
- current-season **regular-season** meetings and wins (season ID matches `game.season`)
- up to 10 most recent prior **completed** meetings, across season snapshots
- consecutive winner streak within available loaded games
- up to 10 completed playoff meetings in the loaded history (not playoff *series* wins)
- a matchup-specific narrative about the season-series leader or most recent winner

The helper deduplicates NHL game IDs, sorts chronologically, excludes viewed/future/live games, rejects missing or tied scores, and returns empty display-safe data when unavailable. It does **not** fetch live API data independently; it uses the same live-refreshed season snapshots as Iceboard. All-time W-L remains blocked.

### P1: archival images and publication safety

The updated separate media asset pack (V5) tracks **28 candidate images for 24 of 27 pairings**. Three new source-specific records cover COL-DAL (2019 game), EDM-VAN (2005 game) and COL-MIN (2008 crowd). Remaining no-specific-photo IDs: `LAK-VGK`, `MIN-WPG`, `OTT-TOR`.

The copyright/license at Commons is not a comprehensive app rights grant. Players, sponsors, trademarks, venues, recognizable fans, and editorial context may require separate legal review. `src/lib/rivalry-media.mjs` has strict deny-by-default controls: render only if `commercial_app_use_approved === true`, a reviewed **local** URL under `/rivalry-media/`, source URL, credit and license metadata. The UI automatically provides on-image attribution once approved. **All current assets remain unapproved** and no image file was added to the Git repository; this is deliberate. COL-MIN's crowd photo also carries a privacy/likeness review flag.

Direct reviewed sources:
- [Dallas–Colorado 2019 — LHC88, CC BY 4.0](https://commons.wikimedia.org/wiki/File:Dr_Pepper.png)
- [Edmonton–Vancouver 2005 — Anders Elkjaer Johansen, PD-self](https://commons.wikimedia.org/wiki/File:Face_off.jpg)
- [Minnesota–Colorado spectators 2008 — Sreejith K, CC BY 2.0](https://commons.wikimedia.org/wiki/File:The_crowd.jpg)

No production deploy or merge was performed.
