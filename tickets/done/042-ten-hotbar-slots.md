# 042 - Ten hotbar slots with keys 1-9 and 0

**Priority:** P2 - **Status:** Done (2026-10-12)

## Problem
The hotbar has 4 slots (`NUM_SLOTS = 4`, duplicated in `QuickAccessBar.tsx` and `QuickAccessContext.tsx`) and the key handler hard-codes `'1'..'4'`. Need 10 slots: keys 1-9 select slots 1-9, key 0 selects slot 10.

## Decisions (owner Q&A)
- Existing saved hotbars (localStorage `nvg_quick_slots_<characterId>`, 4 entries) are padded with 6 empty slots; slots 1-4 keep their items. No reset.
- Slot label shows the key: 1-9 then 0 (replaces the "Keys 1-4" hint).

## Plan
1. One shared `QUICK_SLOT_COUNT = 10` (export from the context or `packages/shared` if the server ever needs it; run `npx tsc` in shared if so). Remove the two local `NUM_SLOTS` copies.
2. Context load: pad/truncate saved array to `QUICK_SLOT_COUNT`.
3. Key handler: replace the if/else chain with a `keyToSlotIndex` mapping (`'1'`->0 ... `'9'`->8, `'0'`->9); keep the input/textarea guard.
4. `QuickAccessBar`: render 10 slots, key label per slot via the same mapping.
5. Tests (`QuickAccessContext.test.tsx`, bar tests): all ten keys select the right slot, 0 -> slot 10, key pressed in an input is ignored, 4-entry saved array loads as 10 with the first 4 intact, swap/set work on slots 5-10, out-of-range ignored.
6. Mutation-check: map `0` to the wrong slot / drop the padding, confirm tests fail, restore.

## Notes
- Check that no other key binding (e.g. B for debug, movement keys) conflicts with digits.

## Implementation notes
- New `contexts/quickSlots.ts`: `QUICK_SLOT_COUNT = 10`, `QUICK_SLOT_KEYS`, `slotIndexForKey`, `keyLabelForSlot`. Both local `NUM_SLOTS` copies are gone; the context key handler is one mapping instead of an if/else chain; the bar labels each slot from the same mapping (1-9, then 0).
- Saved hotbars pad out to 10 (existing load loop already filled missing entries with null; now covered by a test).
- The HUD controls hint now reads "1-0 Quick Slots".
- Tests: new `quickSlots.test.ts`; `src/contexts/QuickAccessContext.test.tsx` (10 defaults, padding of a saved 4-slot hotbar, slots 5-10 set/swap, out-of-range ignored, keys 1/5/9/0, ignored in inputs). Legacy suites under `tests/` (bar, context, HUD) updated for 10 slots, and the HUD one for the removed panel (040) and mocked hotbar (041). Mutation-checked: mapping key 0 to the wrong slot fails 4 tests. Full client suite 517/517, typecheck clean.
- 040/041 follow-up: the first runs of those tickets only covered `src/`; the `tests/` folder suites were fixed here.
