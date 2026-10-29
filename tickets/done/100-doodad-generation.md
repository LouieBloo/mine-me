# 100 - Doodad generation

**Priority:** P1 - **Status:** Done (closed by the owner 2026-10-26) - **Depends on:** 096, 099

## Problem
Place doodads on the generated map using data rules per biome.

## Proposed design
- A generation pass after blocks, fluids and gases are placed. For each cell and each anchor type, find candidates: floor = open cell with a solid cell below; ceiling = open cell with solid above; wall = open cell next to a solid; air = open cell not touching any block.
- For each candidate, roll the doodads allowed in the cell's biome mix (blend weights from 096), by `density` and `weight`. Honour the doodad's spawn rules: depth range, which block types it may sit on, optional "near fluid/gas", "dark only", minimum spacing.
- Multi-cell doodads need the full footprint open and the anchoring edge fully supported, and must not overlap another doodad. Use the piece pattern for the footprint and size.
- Pick a size variant by weight.
- Doodads never spawn in the entrance area or inside fluid (unless the doodad says so).
- Output: a placement list `{ doodadId, x, y, w, h, variant, seedRoll }` stored on the map state. Deterministic per seed.
- Cap the total count (config value on the Mine Generator page) so the scene stays cheap; check with the F3 profiler (new "doodads" line).
- Sandbox mode (065): no generated doodads by default; a sandbox tool places them by hand (ticket 107).

## Tests
Determinism, anchoring correctness for all four anchors, footprints fit and do not overlap, biome weights respected, count cap, none in entrance. Mutation: skip the support check -> a test fails.

## Built (2026-10-24, stage 2)
- `apps/server/src/services/mining/doodads/DoodadGenerator.ts` (`generateDoodadPlacements`), called last in `MiningMapGenerator.generate()` (after blocks, pockets, ores, rocks and biome swaps), so it only reads the finished map. Its own salted random stream (`DOODAD_SEED_SALT`): with no doodads, or a cap of 0, it draws nothing and the map is byte-identical (a test compares blocks, fluids and gases).
- **How it picks:** for each doodad with a biome link (sorted by key), every open cell in its depth window is rolled against `DOODAD_BASE_CHANCE` (0.03) x the biome-mix of the link's `weight` x `density`; a win picks a size by weight (and a side for wall doodads) and is kept only if the footprint is all open air, not in fluid, and the anchor edge is solid along its whole length and made of blocks the doodad may sit on (AIR: no block touching the footprint, corners included). The winners are shuffled and taken in turn, skipping overlaps and crowding (`minSpacing`) until the cap, so the cap never favours the top of the map.
- Anchors: FLOOR = row under the footprint, CEILING = row over it, WALL = column on the left (or right, `flip`), AIR = none. Shared helpers in `packages/shared/src/gameLogic/doodad/doodadPlacement.ts`.
- Placement is `{ typeIndex, x, y, variant, flip }`; the kind index is the position in the key-ordered list (`orderDoodads`). The size comes from the definition and `variant`.
- Cap: map-config value `doodadMaxCount` (Prisma column, default 400, validation 0-5000, "Scenery" card on the Mine Generator page). Entrance: nothing within the ore clear zone (3 cells either side, top 6 rows).
- Speed: about 50 ms for 20 doodad kinds on a full 135x135 mine (test: under 1.5 s with the rest of generation).
- Sandbox: no generated doodads (the sandbox builder returns none); `MiningDoodadSubsystem.add/removeAt` are the hooks for the hand-placing tool (107).
- Tests: `DoodadGenerator.test.ts` (determinism, all four anchors, footprints, no overlap, sizes, biome shares, weight/density, depth, block rule, near fluid/gas, not in fluid, spacing, dark-only, cap, entrance), `miningMap.doodads.test.ts`, `Scenery` card and config route tests. Mutation-checked: skipping the support check and skipping the overlap check each fail 4 tests.

## Decisions (assumed, to confirm) - stage 2
- `weight` and `density` both multiply the chance (weight = how common against other doodads, density = how many overall).
- "Dark only" = at least 12 rows (4 original blocks) below the ground, since the generator has no lighting.
- Default cap 400 doodads; the base chance 0.03 per fitting spot is a first guess to tune with real doodads.
- A doodad is never generated in the sky rows or the surface row (surface scenery is ticket 135).
