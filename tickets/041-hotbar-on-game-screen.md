# 041 - Move the quick access hotbar onto the mining screen (top left)

**Priority:** P2 - **Status:** Done (2026-10-12)

## Problem
`QuickAccessBar` is rendered inside the backpack header of `InventoryPanel` (right panel). It should be on the game screen itself, top-left, as plain HTML/CSS (not Pixi).

## Decisions (owner Q&A)
- Hotbar is the first (topmost) item in the top-left HUD column; Temporary Backpack below it; zoom panel (043) floats below when visible.
- Remove it from `InventoryPanel` entirely.
- Drag and drop must keep working between backpack (right panel) and hotbar: backpack item -> hotbar slot, hotbar slot <-> hotbar slot (swap).
- Layout: a horizontal row of slots (matches the 10-slot count in 042).

## Plan
1. `MiningHUD.tsx`: render `<QuickAccessBar />` at the top of the top-left column (container stays `pointer-events-auto`).
2. `InventoryPanel.tsx`: remove the `<QuickAccessBar />` and its "4 Quick Access Slots" comment/import; fix spacing.
3. Confirm `QuickAccessProvider` wraps both the HUD and the inventory panel (it must, for drag/drop to share state); adjust provider placement if not.
4. `QuickAccessBar.css/tsx`: restyle as a compact horizontal HUD strip (slot size, key label, selected state), keep hover state and pointer cursor on every slot.
5. Tests: `InventoryPanel` no longer renders the bar; `MiningHUD` renders it; drag/drop still reaches the context.

## Notes
- Hotbar must not steal mouse clicks meant for mining outside its own slots.
- Depends on 040 only for layout (same column); can be done independently.

## Implementation notes
- `QuickAccessBar` is now rendered first in the `MiningHUD` top-left column and removed from `InventoryPanel`. `QuickAccessProvider` already wraps the whole app in `App.tsx`, so drag/drop between the backpack and hotbar shares state with no change.
- Restyled as a compact horizontal strip (fixed 3.25rem slots, HUD panel look). The "Quick Access / Keys 1-4" header is gone; per-slot key labels are done in 042.
- Tests: new `QuickAccessBar.test.tsx` (select, drop-from-backpack, slot swap, right-click clear), `InventoryPanel.test.tsx` (no hotbar), `MiningHUD.test.tsx` (hotbar first in column). Mutation-checked: removing it from the HUD fails the placement test. Client typecheck clean.
