# 064 - Torches light oil

**Priority:** P2 - **Status:** Done (2026-10-13); data applied, restart the server to load it - **Depends on:** 056, 057

## Problem
A torch next to oil should set it alight.

## Decisions (064 Q&A 2026-10-13)
- **Which (owner):** placed torches and carried items. There is no held torch in the game (the Torch is a consumable you place), so "carried" is the player's equipped item with an `Ignites` effect (like the Flame Pickaxe).
- **How (owner):** data, not code. The item's `Ignites` effect (value = strength %) decides, rolled against the oil's own ignition chance, exactly like every other ignition source. No torch is named in code.
- **Reach (default, flag if wrong):** a placed torch lights oil in its own cell and the four cells touching it; a carried item lights oil in the cells the player's body is in. Rolled on every fire step (10 Hz), so oil that flows up to a torch later is lit too.

## Implementation notes
- `MiningIgnitionSubsystem.addTorch(x, y, itemId)` remembers the item a torch was placed from (not its strength, so editing the item in the admin applies live); `emitFromSources()` runs on every fire step (`MiningFireSubsystem.update`), forgets a torch once its tile is no longer a torch, and skips dead players.
- `placeTorch` takes the item id; the placement socket handler passes the torch it consumed.
- Torches placed before this change (or by map generation) are not registered and light nothing.
- **Data:** `prisma/add-ignition-effect.ts` now includes the Torch. Applied to the dev DB on 2026-10-13 (owner approved): the Torch has `Ignites` at 100. It was a direct DB edit, so the server needs a restart to load it.
- **Tests:** 12 engine scenarios (own cell + neighbours only, later-arriving oil, item without the effect, unknown item, weak strength, live edit, torch removed, end-to-end burning, carried item, ordinary tool, dead player) plus the script plan. Mutation-checked: the per-step call, the removed-torch check, the dead-player check and the strength lookup each fail a test.
- The placement socket handler has tests (`placementHandlers.test.ts`: passes the item id, refunds a refused placement, no torch); dropping the item id fails a test.
