# 131 - Clouds

**Priority:** P2 - **Status:** Done 2026-10-29 - **Depends on:** 130

## Proposed design
- A `CloudField`: a pool of cloud sprites from a few cloud images (variants listed on the environment) drifting slowly across the sky at their own parallax and speed, wrapping around. Count and darkness depend on the weather state (132-133): few and white when clear, many and gray in storms.
- Cloud positions are a function of seed and time, so every client shows the same clouds without sending positions.
- Clouds are cosmetic, in the sky layer only, and fade with depth like the rest (130).
- Cloud shadows on the ground are out of scope.

## Tests
Deterministic positions for a time and seed, wrap-around, count follows weather density, pooling.

## Built (2026-10-28)
- **`CloudField`**: a pool of up to 24 sprites (the environment's `clouds.maxCount`) drifting at their own speed and parallax. Where each is comes from the shared `cloudSpecs(seed, n)`, `cloudX(spec, clock)` and `cloudAlpha(spec, density)`, so every client shows the same sky without being told; the weather's cloud density says how many show (each fades in above its own threshold) and its darkness greys them (white clouds tinted towards storm grey).
- Pictures come from the environment (`clouds.textureUrls`, any number up to 6, shapes picked per cloud); without them three soft cloud shapes are painted in code from `cloudPuffs`.
- Tests: pool size, count follows density, wrap and view range, drift with the clock and same place for the same time, matches the shared maths, tint, pictures loading and failing.

## Decisions (assumed, to confirm)
clouds sit between the sun and the scenery strips (so mountains cover the low ones); there are no cloud shadows on the ground (out of scope, as the ticket says); a cloud is 16 small blocks wide times its own scale.
