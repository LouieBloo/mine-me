# 089 - Placeables take 3x3 cells (ladder, torch, bridge)

**Priority:** P1 - **Status:** Done (2026-10-17) - **Part of:** small blocks epic (085-090) - **Depends on:** 085 (done; the owner chose 3x) - **Phase 2**

## Problem
Ladders, torches and bridges are tile types (`MiningTileType.LADDER/TORCH/BRIDGE`) placed into one cell. With cells a third of the original size they would be a third the size and need 9x the items. The owner wants them to stay the size they are today, so a placed piece is `BLOCK_SCALE` x `BLOCK_SCALE` cells (3x3).

## Design
- **A placed piece is 3x3 cells** (the footprint is `BLOCK_SCALE` x `BLOCK_SCALE`). Placing fills a 3x3 footprint with the tile type. The cursor cell is the centre cell (the footprint is odd), nudged by one if that is the only way it fits. The whole footprint must pass the existing "only into empty space" rule (`MINING_CONFIG`'s buildable check), and reach is measured to the footprint's centre.
- **One piece, one item.** Each footprint cell records its piece's anchor (the centre cell). Keep this as a side map from cell to anchor in the block subsystem, sent with the grid, so the tile types themselves don't change. Mining, blasting or burning any cell of a piece removes all four cells and refunds or drops one item.
- **Behaviour per cell is unchanged.** Ladder cells are climbable, bridge cells are solid, torch cells give light. The torch light is one light at the footprint centre, not nine.
- **Drawing:** one sprite per piece, drawn across the 3x3 at the original on-screen size (about 64px), plus one placement preview and reticle for the footprint.
- **Generic, not per item.** The footprint size is data on the placeable's tile definition (`footprint: { w: 3, h: 3 }` (written as the scale) in the shared tile table), so a future 1x1 or 5x1 placeable needs no code change.

## Decisions (2026-10-17)
- Same size as the original game for ladders, torches and bridges: 3x3 at the 3x scale (it was 2x2 at the 2x scale).

## Tests
- Place a ladder in a 3x3 gap: nine ladder cells, one item used. Place next to rock where only a nudged footprint fits: it is placed nudged. Where no footprint fits: refused, no item used.
- Mine one cell of a bridge: all nine cells cleared, one bridge dropped.
- A 3-wide ladder shaft can be climbed top to bottom. A torch lights from its centre with one light source.
- Mutation check: drop the footprint emptiness check for one cell, the "refused over rock" test fails.

## 3x notes (2026-10-17)
The spike's sandbox already draws its ladder 3 cells wide (the sandbox layout scales with `BLOCK_SCALE`), so climbing a 3-wide ladder is what to expect. The character is 1.9 cells wide, so a narrower ladder (1 or 2 cells) is also climbable (`LADDER_GRAB_WIDTH` 1.65): if 3x3 ladders and torches look too big next to a 3-block character, the footprint is data per placeable and can be smaller.

## Implementation notes (2026-10-17)
Built as designed, with these specifics:
- **Shared** (`packages/shared/src/gameLogic/pieces.ts`): `getTileFootprint(type)` (1x1 unless a piece type; ladder, torch and bridge are `BLOCK_SCALE` x `BLOCK_SCALE`, one table to add a new placeable), `findPieceAnchor(cursor, footprint, fits)` (the cursor is the middle; nudged to the nearest anchor that still covers the cursor cell and fits; stable ties), `pieceCells`, `pieceCentre`, `pieceCentreCell`, `pieceAnchorOf`, `pieceOrigin`, `isPieceCentreCell`. The server and the client run the same search, so the reticle shows what a click does.
- **Cell offset, not a side map:** each cell of a piece carries `piece: [ox, oy]` (its place from the top-left cell) on `ServerTile`, `MiningClientTile`, `PendingTileUpdate` and the `revealedTiles` wire entries (also on fog reveals and the join snapshot). The offset is what lets the server find the rest of a piece and the client cut the art.
- **Server** (`MiningBlockSubsystem`): `piecePlacement()` is the one validation for ladder, torch and bridge (bounds, fog, empty, no body for solid pieces, reach to the piece's middle with the lag slack) and reports the cursor cell's problem; `placePiece()` writes every cell, colliders for solid pieces. `clearPieceSiblings()` runs on every way a cell can go (`completeMiningBlock` = mining and burning, explosions, `burnBlock` into another block, `placeBlockFromReaction`), so a piece is never left half there; explosions and mining drop once per piece. The torch registers one ignition source in its middle cell; its ignition radius is `BLOCK_SCALE / 2 + 1.01`.
- **Client:** `MiningTileRenderer.pieceSlice` cuts a piece's art into one cached slice per cell (fallback art is drawn whole from the top-left cell); the torch light and flame belong to the middle cell only (tick handler and ambient effects); `resolveBuildableAnchor` drives `canExecute` and the reticle (`ReticleStyle.pieceArea`, green over the nudged area, red but full size when refused); `applyPlacedPiece` shows an accepted piece before the server tick.
- **Tests:** shared `pieces.test.ts`; server `MiningGameEngine.pieces.test.ts` (fill, offsets, wire, nudge, refuse, fog, body, reach, whole-piece removal by mining, blast, fire and reaction, neighbouring pieces untouched, one torch source, 3-wide ladder climbing); client `resolveBuildableAnchor.test.ts`, `optimisticPlacement.test.ts`, tile renderer and tick handler tests. Mutation checks: no sibling clearing fails six tests, a footprint check on the cursor cell only fails the nudge and refuse tests, a torch light on every cell fails the tick handler test.
- **Known gaps:** the sandbox's pre-built ladders are single cells without an offset (they draw as one squeezed ladder per cell and climb fine; give them pieces if they look wrong); cracks on a piece with no art are drawn per cell under the whole-piece fallback drawing.
