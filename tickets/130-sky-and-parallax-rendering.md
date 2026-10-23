# 130 - Procedural sky and parallax scenery

**Priority:** P2 - **Status:** Open - **Depends on:** 129, 139 (sky rows)

## Decisions (2026-10-22, from the owner)
- **Procedural sky gradient + a few layered parallax strips**, so Gemini only has to make a few wide tileable strips and small sprites.
- Surface only: the background shows above ground and where the camera sees open sky, and fades out as you go down.

## Proposed design
- `SurfaceBackgroundRenderer` (Pixi v8, in `MiningGrid/renderers`): a screen-space sky (gradient from the environment colors via a generated texture or a simple shader, plus a sun sprite or disc) behind everything, then the environment's layers as tiling sprites (`TilingSprite`) scrolled by `cameraX * parallaxFactor` and anchored to the surface row so mountains sit on the horizon.
- Layers are drawn behind terrain and entities, in front of the sky. Tile edges must be seamless horizontally (art requirement, 137).
- Fade: as the camera moves below the surface row the whole background alpha eases to 0 and the layers are hidden, so there is no cost underground.
- Culling and cost: only create sprites for on-screen layers; 3-4 layers max by default; add a "background" phase to the F3 profiler.
- The default environment (129) draws just the sky gradient and sun.
- The block-scale rule applies: layer positions in blocks use `MINING_TILE_PIXELS`; image sizes stay pixels.

## Tests
Parallax math (camera x vs layer offset), fade with depth, layer ordering, default environment, no sprites created when underground.
