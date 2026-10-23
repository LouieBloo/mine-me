# 135 - Surface props via doodads (trees, bushes, birds)

**Priority:** P2 - **Status:** Open - **Depends on:** 129, 139, doodads 099-103 (and 106 for birds)

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
