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
