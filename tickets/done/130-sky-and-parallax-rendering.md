# 130 - Procedural sky and parallax scenery

**Priority:** P2 - **Status:** Done 2026-10-29 - **Depends on:** 129, 139 (sky rows)

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

## Built (2026-10-28)
- **`SurfaceBackground`** (Pixi v8, in `MiningGrid/surface/`): a sky gradient in 24 bands (from the environment's top and horizon colours, greyed by cloud cover), a sun with a halo that drifts slightly against the camera, and the environment's layers as `TilingSprite`s scrolled by the shared `layerTileOffset` (parallax 0 = moves with the ground, 1 = fixed on screen), standing on the horizon plus each layer's offset.
- **No art needed:** a layer without a picture is a silhouette painted once into a small canvas (shared `silhouetteHeights`: periodic, so it tiles with no seam; mountains, hills, treeline or flat) and tinted. A picture replaces it when it loads; a failed load keeps the silhouette.
- **Zero cost underground:** the whole background is hidden when the top of the view is below the horizon (`skyInView`), nothing is updated, and the old flat blue sky rect is no longer drawn.
- Profiler: new sections `Surface Background`, `Clouds`, `Weather Particles`, and gauges `Surface objects`, `Clouds shown`, `Weather particles`, `Surface drawn`.
- Tests: parallax math, fade and in-view rules (shared), the silhouette (tiling, range, determinism), layer positions, the sun, picture loading and failing, layer order, rebuild, destroy.

- Layers sit behind the terrain in the world container (so they zoom with it), not in screen space.
- The fade with depth is by clipping: the sky only exists above the horizon, and the weather effects and sounds fade out over 2 to 14 blocks below the ground (`surfaceFade`).
