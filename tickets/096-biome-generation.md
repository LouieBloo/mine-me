# 096 - Biome map generation and blended borders

**Priority:** P1 - **Status:** Open - **Depends on:** 095

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
