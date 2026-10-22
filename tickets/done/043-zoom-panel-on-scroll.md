# 043 - Camera zoom panel shows only after scrolling, then fades

**Priority:** P3 - **Status:** Done (2026-10-12)

## Problem
`ZoomControl` is always visible in the top-left HUD. It should be hidden until the player scrolls the wheel to change zoom, stay visible about 5 seconds so it can be clicked, then fade away.

## Decisions (owner Q&A)
- Hidden by default. A wheel event that changes zoom shows it; each further wheel step restarts the 5s timer.
- While the mouse is over the panel or the slider is being dragged, it stays open; the 5s countdown starts again after the pointer leaves / drag ends.
- Clicking the +/- buttons or the slider also counts as activity (restarts the timer).
- Fade via CSS opacity transition (Tailwind); when fully faded it must not capture clicks (`pointer-events-none`, `aria-hidden`).
- Wheel at the min/max limit (zoom doesn't change) does not need to show the panel. [Assumption: confirm if you'd rather it shows anyway.]

## Plan
1. New hook `useAutoHide(durationMs = 5000)` returning `{ visible, poke, holdProps }` (poke = show + restart timer; holdProps = onPointerEnter/Leave and drag handlers). Pure timer logic, easy to test with fake timers.
2. `ZoomControl`: wrap in the fade container using the hook; call `poke` on button/slider use.
3. Wire wheel -> poke: the wheel handler lives in `useMiningInput.ts` and calls `onZoomChange`. Simplest: `MiningHUD` pokes when the `zoom` prop changes (effect on `zoom`), which also covers the buttons and slider. Avoid showing it on first mount.
4. Tests: hidden on mount; zoom change shows it; hidden after 5s; hover holds it open and re-arms on leave; slider drag holds it; hidden state not clickable; timer cleaned up on unmount. Existing `ZoomControl.test.tsx` updated (testids stay).
5. Mutation-check: change duration / remove hover hold, confirm tests fail, restore.

## Notes
- Zoom is persisted in localStorage (`mining_camera_zoom`); the initial load must not trigger the panel.

## Implementation notes
- New `hooks/useAutoHide.ts` (`visible`, `poke`, `hold(reason)`, `release(reason)`; default 5000ms): timer pauses while any hold is active and restarts when the last is released.
- `ZoomControl` uses it: pokes when the `zoom` prop changes (wheel, buttons, slider; not on first mount), holds on pointer enter/leave and during a slider drag (released on `pointerup` anywhere). Hidden state = `opacity-0 pointer-events-none aria-hidden` with a 500ms fade (`data-visible` attribute for tests). `hideAfterMs` prop overrides the duration.
- Wheel at the min/max limit changes nothing, so it does not show the panel (as assumed in the ticket).
- `MiningHUD` top-left column: hotbar, Temporary Backpack, then zoom panel (last, so its hidden space shifts nothing). The column is now `pointer-events-none` with each child opting in, so the invisible panel's area never blocks mining clicks.
- Tests: `useAutoHide.test.ts` (7), `ZoomControl.test.tsx` (hidden on mount, show, 5s hide, restart, hover hold, drag hold, custom duration), `MiningHUD.test.tsx` (hidden until zoom changes). Mutation-checked: removing the hover hold, the first-mount guard, and changing the duration each fail tests. Full client suite 531/531, typecheck clean.
