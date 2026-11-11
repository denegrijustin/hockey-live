# Phase 5 accessibility checklist (Game Center)

Status key: **A** = automated (spec named), **M** = manual check in the validation wave, **F** = automated but `test.fixme` until the feature merges. Specs: `tests/browser/gc-qa.spec.ts` (guards), `tests/browser/gc-perf.spec.ts`.

## Live region (contract: ONE `role=status`, `aria-live=polite`, `aria-atomic=true`, `data-testid="gc-live-region"`)
- [F] Exactly one region in the dialog; correct role/aria attributes. (gc-qa: "live region: one polite atomic status region")
- [F] Empty on first render and after load of a game already in progress; nothing announced for existing events.
- [F] Announces changes only: goal (scorer, team, new score, period/time), disallowed goal, period start/end, OT, shootout, final. Nothing for shots, hits, faceoffs.
- [F] No clock chatter: poll responses that only change the clock leave the region untouched (gc-qa, 3 clock-only polls).
- [F] A goal is announced once, even when it is re-delivered by overlapping polls or changed (assist correction is NOT a new announcement).
- [F] A disallowed goal is announced once, only after the two-poll debounce, and the text differs from the goal text.
- [M] Coalescing: two goals inside one poll produce one message (a combined line), not two interrupting ones. Check with VoiceOver and NVDA that the message is read in full and not cut by the next one.
- [M] The goal-flash banner on cards (`role=status`) does not duplicate the dialog announcement when both are on screen.
- [M] Politeness: nothing assertive is used anywhere in the Game Center.

## Structure and keyboard
- [A] Dialog has an accessible name ending "full game view"; Escape closes; focus returns to the opener (gc-qa "Escape closes").
- [A] Close button is the initial focus; a poll update never moves focus (gc-qa "does not steal focus").
- [F] `role=tablist` named "Game sections", five tabs, `aria-selected`, one visible `tabpanel`; arrow keys, Home/End move between tabs; Tab moves into the panel. Inactive panes are `hidden` (not just off-screen) so they leave the accessibility tree.
- [M] Play-by-play: filters are buttons with pressed state; "jump to goals" moves focus to the target event; `?event=` highlight is not colour-only.
- [M] Reading order in each tab matches visual order; headings are sequential (no skipped level).
- [M] Modal: background is inert (Tab does not leave the dialog), including after switching tabs.

## Reflow, zoom, motion
- [A] 360px: no horizontal scroll in the dialog or page for scheduled, pregame, live, intermission, OT, final, final OT, final SO, postponed, cancelled, suspended and a 400-event history (gc-qa, 12 cases).
- [A] 320px width and 640px (a 200% zoom of 1280) keep the dialog usable (gc-qa "reflow at 320px").
- [M] Browser zoom 200% and 400% on desktop: tabs wrap or scroll within their own bar (not the page), the sticky tab bar does not cover more than a third of the viewport, focused elements are not hidden under it (`scroll-padding-top`).
- [M] Text-only zoom/large text: line-score and header numbers do not truncate.
- [A] Reduced motion: goal flash is static (gc-qa "reduced motion"). [M] New motion in Game Center (momentum chart, highlight of `?event=`) stops or is instant with reduced motion.
- [M] Tap targets at least 44px: tabs, filters, close, player/team links in play-by-play rows (measure with devtools on a 390px viewport).

## Colour and contrast
- [F] Status pill (`gc-status`) text contrast at least 4.5:1 for live, stale, final, OT, SO, postponed in light and dark (gc-qa "status pill: contrast"; script composites the nearest opaque background).
- [M] Non-text contrast of at least 3:1 for chart lines, focus rings, pressed filters and the pill border in both themes.
- [M] State is never colour-only: stale, disallowed goal, power play carry text or an icon with a name.
- [M] Forced colours (Windows high contrast): pill borders and the active tab stay visible.

## Charts and derived metrics
- [M] `momentum-chart` has a text alternative naming the current leader and numbers; keyboard inspect of points works; the "Iceboard metric" label is present and not hidden.
- [M] Every Derived/Projection label is text, not only colour, and is read by a screen reader next to its value.
