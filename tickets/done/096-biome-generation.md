# 096 - Biome map generation and blended borders

**Priority:** P1 - **Status:** Done (verified by the owner 2026-10-28) - **Depends on:** 095

## Problem
Generation must pick a biome per cell and use it to shape blocks, fluids, gases and mob spawn tables, with soft borders.

## Decisions (2026-10-22, from the owner)
- Noise regions at any depth; blended transitions between biomes.

## Proposed design
- Compute a per-cell **biome field**: for each cell, a weight per biome (seeded noise x depth window x biome weight). The strongest weight is the cell's *primary* biome; the weights drive blending.
- **Blending by weighted choice, not by interpolating values:** each place that rolls a random thing (block, fluid pocket, gas pocket, mob spawn, and later doodads) draws from the *mix* of biome tables at that cell, weighted by the cell's biome weights. Near a border you get a gradual mix of both biomes' content; deep inside one biome you get only its content. Deterministic per seed.
- Blend width is a tunable (`biomeBlendWidth`) in the map config on the Mine Generator page.
- The generator stores the primary biome id per cell in a compact grid (one byte per cell is enough) so later systems (doodads, ambient look, mob spawning) just read it.
- Existing maps with no biomes defined generate exactly as today (the default biome is the old recipe). Keep the generation tests green.
- Fits the 135x135 map: check generation time with the profiler.

## Tests
Determinism per seed; the default-only case equals today's output; a border cell mixes both biomes' blocks over many samples; depth windows; mutation: use hard edges -> blend test fails.

## Built (2026-10-23)
- **Field:** `BiomeField` gives every cell a weight per biome. A biome within `biomeBlendWidth` (noise-score units, default 0.15, 0 = hard edges) of the top score contributes, linearly less the further behind it is; a biome outside its depth window has score 0 and never contributes. Depth limits fade in over a few rows.
- **Blending by weighted choice:** ore, rock and chest spots use a weighted shuffle (a spot where the biome wants more of the block comes up earlier); fluid and gas pockets scale the number of pockets and are kept with probability multiplier / strongest; mobs are drawn from the spot's mix of spawn lists (a biome with no list contributes the map's list); swaps roll against the mixed chance.
- **Exactly as before without biomes:** with no biomes, or biomes that change no blocks, the grid and fluids are identical to the old output (a test compares them). The new random streams (weighted order, swaps) are separate, so nothing else shifts.
- **Config:** `biomeBlendWidth` on the map config (Prisma column, validation 0 to 0.5, "Biome Borders" card on the Mine Generator page).
- **Stored per cell:** the primary biome index (one byte per cell) from `BiomeField.primaryGrid()`, kept by the engine; sky rows added on top are the default biome.
- **Speed:** 135x135 with three biomes generates in about 90 ms (about 11 ms without).
- Tests: `miningMap.biomes.test.ts` (neutral = identical, determinism, ore/rock/fluid weights, swaps with chance, unknown swap target ignored, ground row stays dirt, speed), `MiningGameEngine.biomes.test.ts` (field per room, sky shift, mob spawn lists). Mutation checked: weighted order flattened and swaps disabled both fail tests; hard edges (blend 0) never mix.

## Owner review (2026-10-23)
- `MiningMapConfigData.biomeWeights` (biome key -> weight on this map; null/empty = every biome at its own weight) is resolved by the shared `resolveMapBiomes` in the generator. The default biome always stays. Edited in the "Biomes On This Map" table of the Mine Generator page's Biome card. Eventually each city gets its own list; for now it lives on the one map config.
