# 135 - Surface props via doodads (trees, bushes, birds)

**Priority:** P2 - **Status:** Done 2026-10-29 - **Depends on:** 129, 139, doodads 099-103 (and 106 for birds)

## Decisions (2026-10-22, from the owner)
- **Reuse the doodad system**: trees and bushes are floor doodads on the surface row; birds are wandering/flutter doodads in the sky (AIR anchor). No second prop system.

## Proposed design
- The environment lists its props (129): doodad id, density, spacing. The generator's doodad pass (100) places them along the surface row; the surface is not part of the underground biome mix.
- Trees sway with the wind multiplier (133) using the doodad sway preset; the body-reaction wiggle (104) works on bushes.
- Birds: AIR doodads with the flutter/wander preset (106), flying across the sky in loose groups; they hide in storms (hidden by weather state) and come back when it clears.
- Surface doodads are cosmetic, never block the entrance or the extractor landing pad (120), and never block placement.
- If doodads aren't built yet, a small subset can ship first: static trees and birds via the environment layer (a fallback of sprites on the strips), replaced later.

## Tests
Props placed on the surface only, clear of entrance and extractor pad, wind sway, birds hidden in storms.

## Built (2026-10-28)
- **Props are doodads:** `generateSurfaceProps` (server) places the environment's props on the finished map: floor doodads (trees, bushes) with their feet on the ground row, air doodads (birds) in loose flocks of 2 to 4 at the given heights above the ground. They keep clear of the exit and of the extractor's landing pad, never overlap, honour spacing and a doodad's allowed blocks, and use their own random stream so the underground scenery of a seed is exactly what it was.
- **They act like any doodad:** sway (and sway harder in wind), the bush wiggle, removal when the ground under them is mined, damage if they have health. New `hiddenInWeather` on a doodad (admin "Hides In Weather" panel): birds fade out in rain and storms and come back when it clears.
- **Data applied to the dev DB:** `oak_tree`, `pine_tree`, `bush`, `bird` (placeholder shapes until art), linked to the environments' props. In the sandbox they appear with the doodad generator toggle.
- A measured map: generation stays about 125-190 ms; six seeds gave 6-7 trees, 6-9 bushes and 3-11 birds on Green Valley.
- Tests: placement rules (feet on the ground, entrance and pad clear, spacing, overlap, density, birds in range, wall doodads ignored, allowed blocks), map-level determinism and underground unchanged, loader and admin for `hiddenInWeather`, the renderer's fade in/out and wind.

## Decisions (assumed, to confirm)
a tree is 4 x 8 small blocks (about three characters tall) and a bush 3 x 2; density is "per 100 columns"; the sandbox shows surface props only with its doodad generator on.
