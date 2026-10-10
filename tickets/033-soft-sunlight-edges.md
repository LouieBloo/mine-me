# 033 - Soft sunlight edges

**Priority:** P2 - **Status:** Done (2026-10-10)

## Audit findings
- `calculateSunlightMap` gives one value per tile: 1.0 in the shaft, then x0.4 into open air beside it, 0 for solid. No values in between, so beam edges are a one-tile step.
- `renderSunlight` decides "solid" from `sun <= 0.001` (so shadowed *air* counts as a wall) and insets those edges 2px, which is half a texel at the 0.25 lightmap scale. It softens nothing and leaves a hard cut.
- Beam bottoms fade to 40% and stop at the block, with 3 stacked alpha rects per tile.
- Sun is rendered as many `Graphics` rects, so it can only ever be tile-blocky.

## Decisions (owner delegated; defaults chosen)
- Render the sun as a per-pixel field (8px per tile, matching the lightmap texel) in one sprite texture instead of rects. Bilinear sampling between tile centres gives a smooth penumbra for free.
- Solid tiles never receive sun and never darken their air neighbours (solid neighbours are clamped to the tile's own value when sampling). The floor a beam lands on stays a clean edge.
- Gentler lateral falloff (`SUNLIGHT_LATERAL_FALLOFF` 0.4 -> 0.6) so the bleed into overhangs spans ~3 tiles.
- Ambient/sun blend left alone (sun still composited over the depth ambient).

## Plan
1. `SunlightCalculator`: add `buildSunlightPixels` (pure, tested) that turns the tile map + grid into an RGBA buffer.
2. `LightingEngine`: replace sunlight `Graphics` with a `Sprite` backed by a `BufferImageSource`; update the buffer in place.
3. Shared config falloff 0.6; rebuild shared dist.
4. Tests incl. mutation check (break solid clamping -> test fails).

## Implementation notes
- `buildSunlightPixels` (SunlightCalculator.ts) bilinearly samples tile centres into a premultiplied RGBA buffer, 1 pixel per lightmap texel; `LightingEngine.renderSunlight` uploads it via `BufferImageSource` into one sprite (the old `Graphics` rects are gone).
- `SUNLIGHT_LATERAL_FALLOFF` is now 0.6 (shared rebuilt).
- Mutation-checked: solid-neighbour clamping.
- **Not verified visually** - tests cover the maths, not how it looks in the running game. Tune `maxAlpha`/falloff by eye if needed.

## Not done
- Ambient/sun blend (sun over depth ambient) unchanged; it may still look high-contrast at depth 3-5.
