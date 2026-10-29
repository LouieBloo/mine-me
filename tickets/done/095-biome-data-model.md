# 095 - Biome data model and loader

**Priority:** P1 - **Status:** Done (verified by the owner 2026-10-28) - **Depends on:** none (first of the biome epic 095-098; the doodad epic 099+ needs it)

## Problem
The mine has no notion of regions. Every cell is generated from one global recipe, so the whole map looks and plays the same. We want biomes: named regions that change the block palette, fluids and gases, mob spawns and the ambient look, and that doodads (099+) can be assigned to.

## Decisions (2026-10-22, from the owner)
- **Layout:** noise regions at any depth (seeded 2D blobs), each biome with its own min/max depth. Not depth bands.
- **Borders:** blended transitions, not hard edges (see 096 for how blending works).
- **A biome controls:** block palette, fluids and gases, mob spawns, ambient look (background tint / wall texture, ambient light). **No per-biome music yet**; the one global track stays.
- **Biomes are data**, like items/mobs/blocks/fluids: a `Biome` row, loaded at server start and reloaded after an admin save. No hard-coded biome names in logic.
- **Base-block swaps are in v1** (a biome can replace base blocks, e.g. dirt -> ice, as well as re-weight blocks).
- **Doodads are assigned to biomes** (ticket 099 holds that link).

## Proposed design (to confirm in the Q&A below)
- `Biome` table: `key`, `name`, `minDepth`/`maxDepth` (in small blocks, original value x `BLOCK_SCALE`), `weight`, `noiseScale`, `rarity`, `blockPalette` (block id -> weight multiplier, plus optional base-block swaps), `fluidWeights`, `gasWeights`, `mobSpawns` (mob id -> weight), `ambient` (tint, ambient light level, optional wall texture URL), `isDefault`.
- One default biome always exists, so a map with no matching biome still generates.
- Shared type `BiomeDefinition` in `packages/shared`, a `definitionLoaders` entry, and a tiny client-visible subset (id, key, ambient look) sent once with the map description, not every tick.
- Biome per cell is a pure shared function of (seed, x, y, definitions), so it is testable without the engine.

## Open questions for the owner
1. ~~Base-block swap~~ Decided: yes, in v1.
2. ~~Overlap~~ Decided (2026-10-22, owner): depth windows may overlap; the biome with the highest noise x weight is primary, ties go to the lower key.
3. ~~Entrance guarantee~~ Decided (2026-10-22, owner): none for now. Later, maps will be generated with only certain biomes, and the entrance will be handled then.

## Tests
Loader maps rows to definitions; default fallback; biome-at-cell is deterministic for a seed; depth limits respected. Mutation check: ignore depth limits -> a test fails.

## Built (2026-10-23)
Built without the usual Q&A (the owner asked to run the whole biome epic through); the choices below were mine, please review them.
- **Table:** `Biome` (key, name, description, isDefault, minDepth, maxDepth, weight, noiseScale, blockPalette, fluidWeights, gasWeights, mobSpawns, ambient). `rarity` was dropped: `weight` already makes a biome bigger and more common. Keys are lower case (`frozen_caves`). Depths and `noiseScale` are in small blocks (original x `BLOCK_SCALE`).
- **Shared:** `packages/shared/src/types/biome.ts` (`BiomeDefinition`, `validateBiome`, the built-in default) and the pure `BiomeField` (`gameLogic/biome/biomeField.ts`): seeded value noise per biome (stable by key, never by database order) x weight x depth window; the strongest score is the primary biome, ties go to the lower key. `normalizeBiomes` guarantees exactly one default and adds the built-in one when the table has none.
- **Loader:** `definitionLoaders` reads the table (it is optional, like fluids), `MiningDataManager.getBiomes()/getBiome(keyOrId)`, `biomes.json` is the dev seed mirror (not created until the admin saves).
- **Palette:** `weights` multiply how much of a block is placed (1 = usual, 0 = none); `swaps` turn one block into another (optionally a share), applied last.
- **Not done:** no entrance guarantee (as decided), no per-biome music.
- Tests: `biomeField.test.ts`, `biome.test.ts`, loader tests. Mutation checked: ignoring depth limits fails two tests.

## Owner review (2026-10-23)
- `rarity` stays dropped. Instead each map chooses its biomes and their weights (see 096); a biome's own `weight` is only the default.
- Border softness stays in noise-score units. A biome's mob list replaces the map's list at that spot.
- Biomes have no light of their own (lights belong to doodads, items and mobs): `ambient.light` was removed (see 097).
