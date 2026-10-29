# 145 - Biome dirt, oil and doodad size tuning

**Priority:** P2 - **Status:** Done (closed by the owner 2026-10-27; doodads still need tuning) - **Depends on:** 096, 099, 142

## Problem
Playing the real game showed three things: loose dirt blocks scattered through a biome look like a checkerboard; oil was common (10% of the map from row 6, raised for testing); several doodads were too big next to the 2.7-block character.

## Decisions (2026-10-26, from the owner)
- Inside a biome there is no plain dirt; a mix is only fine at a border between biomes.
- A normal mine has little oil. It comes from biomes that ask for it, and from future goals and map templates. It forms deeper in the mine.
- Just lower the doodad sizes now (no random size range).

## Built
- Every biome's DIRT swap is a full chance (rock swaps stay partial, as they read as rock types, not a checkerboard). `prisma/tune-biomes-and-oil.ts` (dry run by default; applied) also set the default biome's oil weight to 0 and Oil's generation to at most 3% from depth 30 (10 original blocks). The seed (`add-first-biomes.ts`) and `fluids.json` match.
- `prisma/shrink-doodads.ts` (applied): stalactite, stalagmite, glow crystal, icicle, wall moss and dripping stalactite are 1x2 (a rare larger variant is the old size); cave and glow mushrooms 1x1 (rare 2x2); lava vent 2x1; grass tuft 1x1. The picture is fitted inside the footprint keeping its shape, so no art changed. `add-first-doodads.ts` and `doodads.json` match.
- Tests: both scripts have tests (plans, idempotence, the seed matching), mutation not needed.

## Open
- A random size range per doodad (min/max scale) was offered and not wanted for now; the existing size variants (weights) cover variety.
