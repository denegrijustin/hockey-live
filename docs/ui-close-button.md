# Game Center close button

One close control for the Game Center: `src/components/gc/GameCenterClose.tsx`.

## API
`<GameCenterClose onClose={fn} buttonRef={ref?} />` renders
`<div class="gc-close-wrap"><button type="button" class="gc-close" aria-label="Close game details">` with the Lucide `X` (`Icon name="close"`, 20px).
Render it as the first child of the scrolling `<dialog class="game-dialog">`. There is exactly one `button[aria-label^="Close"]` in the dialog.
Team profile and Player dialogs keep their own `.dialog-close` ("Close x").

## Positioning
- `.gc-close-wrap` is a zero-height `position: sticky` strip (z-index `--z-float`), so it takes no layout space and keeps working while the
  dialog is transformed (sheet animation, swipe drag). It spans the dialog's padding box (negative margins = dialog padding, `--gc-px/--gc-py`),
  so the 44x44 button sits 8px (or the safe-area top) from the dialog top and 12px (or the safe-area right) from its right edge, also at 1440
  where the content column is centred. Resting position == pinned position (within 1px at any scrollTop).
- Header meta row (`.gc-header-meta`) reserves right padding and the sticky `.gc-tabs` bar stops short of the button (margin-right plus a
  background shadow that fills the slot), so the button never covers the status pill, score or tabs.
- `.dialog-toolbar` is now only the phone swipe handle (grabber, 28px; hidden on desktop). Swipe-to-dismiss still lives on it; buttons are ignored.
- Style: `--float-btn-*` tokens (size 44, radius, translucent bg, line, fg), hover tint, `:focus-visible` 2px `--mint` outline offset 2, no animation,
  `touch-action: manipulation`.

## Closing and restoration
- Click, Enter/Space, Escape and swipe all call `closeOverlay`, which is idempotent (a `closing` ref), so Escape's `cancel`+`close` or a double tap cannot close twice.
- Every opener goes through `useGameRoute`, including `GameCard` (`?game=` pushed). Close = `history.back()` when the app pushed the entry
  (`history.state.gc`), restoring `?date=`, filters, team and the window scroll (history state + the overlay's `returnTo`, both the value at the tap).
- Direct link (`?game=ID`, nothing in-app under it): the params are removed in place with `replaceState` and, when the address has no `view`,
  the Games view takes over (`?view=games`, via a synthetic popstate). History length is unchanged; the app never navigates to the previous external page.
- Focus returns to the opener (fallback: the game's `.sb-main`). Reopening mounts a new dialog at scrollTop 0.

## Accessibility
Icon-only button with an accessible name, 44x44 target, visible focus ring, icon contrast >= 3:1 in dark and light (tested), initial focus on open,
dialog keeps its own `aria-label` ("... full game view").
