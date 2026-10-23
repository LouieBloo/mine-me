# 102 - Doodad rendering (static, layered, lit)

**Priority:** P1 - **Status:** Open - **Depends on:** 101

## Decisions (2026-10-22, from the owner)
- Drawn between the background wall and entities: in front of the back wall, behind players, mobs and dropped items. Lit by the cavern lighting (dark in the dark), so no "in front" flag in v1.

## Proposed design
- `DoodadRenderer` in `MiningGrid/renderers`, a Pixi v8 container with a sprite per visible doodad, positioned by anchor and footprint (a floor mushroom's base on the block top, a ceiling drip hanging from the block bottom, a wall piece rotated or flipped to face away from the wall).
- Cull to the camera rect; pool sprites; only create sprites for doodads that are on screen (the scene may hold hundreds). Texture batching: one texture per doodad type.
- Removal on delta, with a short fade or pop (cosmetic).
- Preloads: textures are `/assets/...` URLs so the preloader finds them.
- Performance: add a "doodads" phase to the F3 profiler (`miningProfiler.timeEvent`) and count display objects.

## Tests
Positioning for each anchor, culling, pooling, removal; renderer layering order vs entities.
