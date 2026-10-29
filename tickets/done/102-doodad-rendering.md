# 102 - Doodad rendering (static, layered, lit)

**Priority:** P1 - **Status:** Done (closed by the owner 2026-10-26) - **Depends on:** 101

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

## Built (2026-10-24, stage 3)
- `renderers/DoodadRenderer.ts`: one pooled sprite per doodad near the camera (the camera rectangle in cells plus a 3-cell margin), made from `world.doodadFieldRef` (`DoodadField.inRect`). It only recomputes the set of sprites when `DoodadField.version` changes (new, a counter bumped by every addition/removal) or the camera moves into another cell; each frame it only poses the ones on screen. Pooled sprites are reused for other doodads and a late-arriving picture for an old doodad is ignored.
- **Layering:** a `doodadContainer` right after the tiles and before the belt, extractor, fluids, bodies and light: behind players, mobs and dropped items, in front of the back wall and block art, and darkened by the cavern lighting like everything in the grid. `sortableChildren` with the doodad's `zOffset` as the draw order.
- **Position:** `layoutDoodad` / `layoutDoodadParts` (shared `doodadLayout.ts`, pure, so the admin preview can reuse them): the picture is fitted into the footprint with its aspect kept, its base on the anchored edge (bottom-centre FLOOR, top-centre CEILING, wall edge middle for WALL, centre AIR); a WALL doodad whose wall is on the right (`flip`) hangs off the right edge and is mirrored. A size variant with its own picture uses it. A doodad in parts is fitted as one picture (the box that holds all parts) and each part keeps its place.
- **No art yet:** a doodad without a `textureUrl` (or whose picture fails to load) is drawn as a coloured placeholder for its anchor (mushroom for FLOOR, stalactite for CEILING, mossy patch for WALL, glowing dot for AIR; colour from the key), so doodads can be seen before any art exists. The picture replaces it the moment it loads.
- **Removal:** a doodad that loses its block while on screen fades and pops for 0.25 s then goes back to the pool (and the break sound plays); one that was off screen just goes.
- **Profiler:** a "Doodads" section in the per-frame breakdown, and the gauges "Doodads drawn", "Doodad lights" and "Doodad emitters" (`sceneStats`), next to the existing display-object counts.
- Tests: `DoodadRenderer.test.ts` (anchors and mirror, culling and the margin, pooling, no work when nothing changed, z order, fade and listener, late pictures, size-variant picture, parts, motion), shared `doodadLayout.test.ts`, `DoodadField.test.ts` (version), `sceneStats.test.ts`. Mutation checked: culling check removed, per-doodad phase removed, removal detection removed: each fails tests.

## Decisions (assumed, to confirm)
- A doodad's picture is **fitted inside** its footprint (aspect kept), never stretched; the generator's footprint is the cell box, so art with a different shape leaves empty space on the side. OK, or should the picture fill the footprint?
- Doodads are drawn **above the block art** (so a wall doodad can overlap the wall block edge a little) but below everything else.
- **Fade on removal:** 0.25 s, a 25% pop. Cosmetic only.
