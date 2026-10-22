# 090 - Mob pathfinding and digging for bodies bigger than one cell

**Priority:** P1 - **Status:** Done (2026-10-17) - **Part of:** small blocks epic (085-090) - **Depends on:** 085, 086, 087 (done; the owner chose 3x) - **Phase 2: next (088-090)**

## Problem
`MiningPathfinder` assumes a mob is one cell: it checks one cell for walking and one or two cells above for jumps (`up1Y`, `up2Y`, the pit checks). With cells a third of the original size a mole person is about 2 cells wide and 3 tall (the default body is 1.9 x 2.7 cells; the Target Dummy is 2.4 x 3.75), so A* finds paths through gaps the body cannot fit through. Mobs then get stuck or dig in the wrong place. Pathing also costs about 9x on a 135x135 grid (the search area per path is 9x as many cells).

## Design
- **Clearance-aware A*.** A node is the cell under the body's bottom-left. It is walkable only if the whole collider footprint (`ceil(colliderWidth) x ceil(colliderHeight)` cells) is free and supported. Walk, step-up (1 cell, as 087), jump (up to `maxJumpTiles`, now doubled) and drop moves check the body's footprint along the move.
- **Digging.** A `CHASE_AND_MINE` mob that digs digs a tunnel its own size: the AI picks the cells blocking its footprint, mines them one at a time with its existing mine cooldown, and moves when the footprint is clear.
- **Cost.** Pathing keeps the `MOB_PATHS_PER_TICK` budget. Precompute a per-tick clearance map (the free height and width at each cell), so a footprint check is one lookup instead of w*h. Record pathing time per search at 90x90 in this ticket.

## Decisions (2026-10-17)
- Mobs step up 1-cell ledges (087), so the pathfinder counts a 1-cell step as a walk.

## Tests
- A 2x3 mob (footprint of the default body) does not path through a 1-wide or 2-tall gap; it does through a 2-wide 3-tall tunnel (a generated tunnel is 3 cells wide).
- It walks up a staircase of 1-cell steps without jumping and jumps a ledge up to its jump height (about 3.9 cells for a default-speed body at 3x; `maxJumpTiles` scales).
- A digging mob blocked by a wall clears a gap its own size and walks through.
- A 1x1 body (in tests) still paths exactly as before (regression).
- Mutation check: make the footprint check look at one cell only, the gap test fails.

## 3x notes (2026-10-17)
- The pathfinder's jump options only go 1 or 2 cells up (`up1Y`, `up2Y`), and the mob AI's look-ahead and "jump over a one-tile obstacle" logic assume a body one cell tall (`currentTileY`, `headTileY`). At 3x a mob can jump about 4-5 cells, so those need to become `maxJumpTiles`-driven loops as part of this ticket.
- `maxJumpTiles` (the mob's `aiConfig`) now scales with `BLOCK_SCALE` in the migration; the AI default is 1 cell and should become a scale-based default.

## Implementation notes (2026-10-17)
- **Pathfinder** (`MiningPathfinder.findPath`): new options `bodyWidth` / `bodyHeight` (cells; default 1 x 1, which behaves exactly as before). A node is the footprint's left column and bottom row; every move needs the whole footprint free, and a body is supported when any column under it is solid. `footprintOf(width, height)` rounds a body in tiles up to cells (1.9 x 2.67 -> 2 x 3). New moves: a one-cell ledge is **stepped up** (a WALK), vertical and diagonal jumps go up to `maxJumpTiles` cells, a pit jump is `bodyWidth + 1` cells long, and digging opens the whole footprint: a MINE waypoint carries `mineTarget`, the cell to dig next (all the solid cells in the footprint must be mineable, and the cost is the sum).
- **AI** (`ChaseAndMineAI`): `MobAIContext` has `body` (size in tiles) and `jumpTiles` (cells it can jump, from jump force and gravity); with a body the AI plans from its footprint node, walks to the middle of the footprint, digs the waypoint's cells one by one, and jumps only obstacles higher than a step. Without `body` (older tests) nothing changes. The search depth is 500 x scale nodes: at 135x135, 600 reached the goal in about half of random 36-cell paths, 1500 in about three quarters, 3000 in 85%; 1500 costs about 1.4 ms per search (4 searches a tick at most).
- **Server:** the mob subsystem passes the body and jump height.
- **Tests:** `MiningPathfinderBodies.test.ts` (doors, steps, ledges, digging; mutation check: a footprint one cell tall fails three of them) and the engine test `MiningGameEngine.mobBodyPathing.test.ts` (a mob walks through a door as tall as it is without digging, digs a gap its own size through a solid wall, treats a one-cell door as a wall, and stays put when it cannot dig; without the body size two of them fail).
- **Cave generation fix found on the way (belongs to 088):** smoothing the caves on the real grid made cell-sized pockets (41 six-by-six rooms on a map). The caves are now worked out on a coarse grid (one cell per original block), redrawn at full size and rounded with two smoothing passes: about 1000 such rooms, and the cave edges are no longer stepped.
- **Not done:** the pit-jump distance is fixed (one body-width gap plus one), mobs do not use ladders if their footprint is wider than the ladder, and a flying/ceiling-walking mob would need other moves. The mole still spawns only where a default body fits.
