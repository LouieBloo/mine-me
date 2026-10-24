# 105 - Doodads disappear when their anchor is removed

**Priority:** P1 - **Status:** Built, waiting for you to try it (the optional drop-off puff is not built) - **Depends on:** 100, 101

## Decisions (2026-10-22, from the owner)
- A doodad disappears if the block it hangs from or sits on is mined or blown up (a leaky cave block stops leaking when its block is mined). Free-floating (air) doodads are never removed this way.

## Proposed design
- The server keeps a map from anchor cell to doodad. Every path that clears a cell (mining, blast, burn, mob digging, falling rock landing, fluid reaction hardening) already goes through shared completion helpers; hook there, not in each system. Multi-cell anchors: the doodad goes when *any* supporting cell is removed.
- Use `clearPieceSiblings` for the doodad's own footprint pieces.
- Emit a removal delta (101) to clients that had it revealed. Server and client prediction stay consistent: the client also removes it when it predicts its own mining.
- **Decided (2026-10-22, owner):** a doodad whose anchor edge spans several blocks goes as soon as *any* supporting block is removed.
- **Decided (2026-10-22, owner):** doodads never block placement (ladders, torches, bridges); they are background only, and the placed item is drawn in front.
- Optional per-doodad drop-off particle puff (cosmetic).
- Placing a block (bridge, ladder) on top does not recreate it. 

## Tests
Mined, blasted, burned, rock-crushed anchors each remove their doodad; unrelated cell removal doesn't; air doodads stay; delta sent; mutation: skip the hook in the blast path -> blast test fails.

## Built (2026-10-24, stage 2)
- **One hook:** every change to a tile already passes through the room's `pushTileUpdate` (mining, blasts, burning into something else, falling rocks, fluid hardening, placing), so `MiningDoodadSubsystem.onTileChanged` is called there rather than from each system. A doodad goes when a cell it hangs from or stands on stops being solid (any one cell of a wide anchor), or when something solid arrives in its footprint (a falling rock, lava turning to rock). Cracks (same solid type) change nothing. Air doodads have no support so they only go if crushed.
- **Placed items never remove one:** ladder, torch and bridge (`PLACED_ITEM_TILES`, data-driven) are drawn in front of the scenery and do not touch it. A removed doodad is never recreated.
- **Wire:** a removal delta to everyone who had been told about it (`doodadsRemoved`). The client's `DoodadField.onTileChanged` applies the same rules to each tile change it is told about, so the doodad is gone the moment its block is. The client does not predict its own mining (the tile arrives from the server), so there is no extra prediction path.
- Not done: the cosmetic drop-off puff (comes with the renderer, 102/103, using the `break` sound slot).
- Tests: `MiningGameEngine.doodads.test.ts` (mined floor/ceiling/wall, wide anchor, blast, burn-through, rock landing, cracks and placed items keep it, no recreation, silent removal when unseen), `DoodadField.test.ts` (client rules). Mutation-checked: removing the hook fails 8 tests, removing the reveal call fails 2, and removing the client's support rule fails 3.

## Decisions (assumed, to confirm) - stage 2
- Something solid arriving in a doodad's footprint (a rock) removes it, since the doodad would be inside the block.
