# 140 - Basic terrain blocks (stone, clay, sandstone, gravel, ice, bedrock)

**Priority:** P2 - **Status:** Done (verified by the owner 2026-10-28) - **Depends on:** 096 (biome swaps put them in the mine)

## Decisions (Q&A 2026-10-23)
- Six new blocks: **Stone, Clay, Sandstone, Gravel, Ice, Bedrock**. Ores (coal, iron...) are a later set.
- **All plain solid** in v1: they differ by hardness, look and mining time only. No falling gravel, no slippery ice (those would be their own tickets).
- **Drop nothing** at first (like Lavarock); drop tables are edited in the admin Blocks page.
- Bedrock is the exception: it cannot be damaged or mined and survives (and stops) explosions (`isBlastProof`).

## Built (2026-10-23)
- `MiningTileType` 12-17, `MiningBlockTypeKey`, tile definitions (health: clay 25, gravel 20, sandstone 60, ice 80, stone 150; lavarock is 500), the data manager's key list (so the sandbox gallery shows them automatically).
- Client: a coloured stand-in per block (`BASIC_TERRAIN_LOOKS`) until the block has a texture in the admin. Admin biome preview swatches.
- `prisma/add-basic-blocks.ts`: dry run by default, creates only missing rows, Rock texture as placeholder. Applied to the dev DB on 2026-10-23 (the six rows now exist).
- No generator change: a biome swap (`DIRT -> STONE`, etc.) already puts any block key into the mine.
- Not done: `blocks.json` dev mirror entries (the admin save mirrors them once the rows exist); textures (the owner's art job); bedrock has no placement rule of its own, a swap replaces a block everywhere in a biome's depth window, so a "bedrock floor" needs a generator rule later.
