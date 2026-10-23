# 100 - Doodad generation

**Priority:** P1 - **Status:** Open - **Depends on:** 096, 099

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
