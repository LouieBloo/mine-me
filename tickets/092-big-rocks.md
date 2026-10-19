# 092 - Rocks of several sizes (and variable-size pieces)

**Priority:** P2 - **Status:** Built, not yet played (2026-10-18) - **Depends on:** 089 (pieces)

## Problem
Every generated rock was one cell, which at 3x blocks is tiny, and there were too many of them. The owner wants variety: 3x3, 3x1, 2x2 and so on, with bigger rocks hurting more, and the mechanism reusable for other objects that are not 1x1.

## Decisions (2026-10-18, from the owner)
- **A big rock is one solid multi-cell object**, reusing the piece machinery from 089: nine ROCK cells share one rock, which falls and is removed as one. It is not a cluster of 1x1 rocks.
- **Reusable pattern:** any tile type can have objects of any size. A piece's size is recorded on its cells, not in a per-type table.
- **Sizes:** 1x1, 2x1, 3x1, 2x2, 3x3, picked by weight (small common, 3x3 rare).
- **Mass from cell count; damage = the existing speed rule x mass.** A 3x3 hits nine times as hard as a 1x1 at the same speed.
- **Count:** `rockPercentage` is unchanged and now means the share of solid cells that are rock; the owner tunes it on the Mine Generator page. Art: the existing rock texture is stretched over the footprint (no new art yet).

## Design / implementation notes
- **Shared** (`gameLogic/pieces.ts`): `PieceOffset` is `[ox, oy]` or `[ox, oy, width, height]`. `pieceCells(anchor, footprint, recordSize)` writes the size, `pieceFootprint(type, offset)` reads it (the type's own footprint when absent), so ladders, torches and bridges are untouched. `gameLogic/rockShapes.ts`: `ROCK_SHAPES` (id, width, height, weight), `rockMass`, `pickRockShape`, `ROCK_MASS_DAMAGE_EXPONENT` (1 = linear in mass; lower it to flatten the difference between sizes). `MiningFallingRock` gained optional `width`/`height` (only sent for rocks bigger than one cell).
- **Generator** (`MiningMapGenerator.placeRocks`): the budget is in cells. Each step picks a shape by weight, falls back to smaller shapes where it does not fit, and requires every cell to be dirt, clear of the entrance, with solid ground under the whole bottom edge. Cells of a rock bigger than one cell carry the size; 1x1 rocks carry no piece, exactly as before.
- **Falling** (`MiningRockSubsystem`): a rock stays up while any cell under its bottom row is solid, and falls whole when none is. Rocks resting on it (checked over its full width) fall too. `MiningRockEntity` has `cellsWide/cellsHigh`; a big rock is a box body that does not spin (a 1x1 stays the rolling circle), is snapped to the grid on landing and written back as one piece. `clearPieceSiblings` now reads the piece's own size, so a blast removes a whole rock.
- **Damage:** `speed damage x mass ^ ROCK_MASS_DAMAGE_EXPONENT`, applied after the map-config cap (so `rockDamageMax` is the cap for a 1x1; a 3x3 can do nine times that). Knockback grows with the square root of mass. The hit zone is the rock's whole footprint plus a small margin (a 1x1 keeps its old reach).
- **Client:** `MiningTileRenderer` cuts the art with the piece's own size (slice cache keyed by size) and draws the no-art fallback as one rectangle; falling rocks are drawn at their size.
- **Tests:** shared `rockShapes.test.ts`, `pieces.test.ts`; server `miningMap.rocks.test.ts` (sizes, whole pieces, support, entrance, budget, determinism), `MiningGameEngine.bigRocks.test.ts` (support rules, falling whole, landing as a piece, stacked rocks, blast removal, damage grows with mass, edge hit), `MiningRockSubsystem.test.ts`; client tile renderer, entity renderer and tick handler tests. Mutation checks: no mass factor, any-gap-falls, landing without the piece, a 1x1 hit zone, and no support check on placement each fail tests.

## Open points / not done
- The size table and weights are code (`ROCK_SHAPES`), not in the Mine Generator page or the database. Add them to the map config if the owner wants to tune weights in the admin.
- 3x3 damage is 9x a 1x1 and kills a 100 HP player outright at moderate speed. If that is too harsh, lower `ROCK_MASS_DAMAGE_EXPONENT` (0.75 makes it about 5x).
- A big rock held up by even one cell stays up; the player has to clear the whole row under it. Rocks are not mineable, as before.
- Falling-rock size is sent every tick for big rocks only; it could move to a once-per-rock description if the payload matters.
- Sandbox rocks stay 1x1 (its layout is hand-built).
- The 21 server tests that assume dirt health 100 fail because the dirt `health` in `packages/shared/src/data/blocks.json` was changed to 10 (an admin save). Unrelated to this ticket.
