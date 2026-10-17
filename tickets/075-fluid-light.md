# 075 - Fluid glow (light that comes from a fluid)

**Priority:** P1 - **Status:** Done (2026-10-16) - **Part of:** water + lava epic (074-080) - **Depends on:** 054, 061

## Problem
Fluids can only light the mine while burning (`flammability.flameLight`). Lava glows all the time, so a fluid needs its own always-on light, drawn by the existing lighting engine.

## Decisions (Q&A 2026-10-16)
- New nullable Json `light` on `Fluid`: the shared `ItemLightConfig` (reuse, like `flameLight` and held lights; null = no glow). Lava: flickering orange, always on.
- Drawn through the `LightingEngine` like normal, in the client fluid renderer, using the same pattern as `FireRenderer`'s flame lights.
- **Light placement is cheap:** one light per cluster of lava cells (not one per cell) and only for fog-revealed cells, scaled by fill level so a thin film glows less. Exact clustering is found while building; the cap on live lights is a number in one place.
- Edited in the admin Fluids page with the existing light panel (`ItemLightEffectConfig`), with a glow in the fluid preview.

## Checklist
Schema, shared type + validator, loader, definition on the wire (once), admin panel + preview, client light sync, tests.

## Tests
Light appears only when the fluid is present and revealed, one light per cluster, removed when the fluid goes (evaporates, hardens), config validation, admin panel saves.

## Implementation notes
- **Data:** nullable Json `Fluid.light` (an `ItemLightConfig`), sent with the fluid definition (`FluidClientDefinition.light`, only when enabled).
- **Client:** new `FluidGlow` (own class beside `FluidRenderer`, wired through `fluidGlowRef` like `FireRenderer`). Every 150 ms it scans the revealed fluid within 40x26 tiles of the player and groups glowing cells into 4x4-tile buckets: one light per bucket at the fluid-weighted centre, just under the highest surface, dimmed in 4 steps where the bucket is only part fluid. At most 24 lights, nearest first. Lights are rebuilt only when the dimming step or config changes; they move otherwise.
- **Admin:** the existing light panel (`ItemLightEffectConfig`) titled "Fluid Glow" on the Fluids page. **Not done:** drawing the glow inside the admin fluid preview.
- **Tests:** 9 (`FluidGlow.test.ts`: none when nothing glows, one per bucket, per pool, removed when the fluid goes, moves not rebuilt, thin film dimmer, cap keeps the nearest, far fluid ignored, clear); server wire (3); admin. Mutation-checked: the light cap.
