# 131 - Clouds

**Priority:** P2 - **Status:** Open - **Depends on:** 130

## Proposed design
- A `CloudField`: a pool of cloud sprites from a few cloud images (variants listed on the environment) drifting slowly across the sky at their own parallax and speed, wrapping around. Count and darkness depend on the weather state (132-133): few and white when clear, many and gray in storms.
- Cloud positions are a function of seed and time, so every client shows the same clouds without sending positions.
- Clouds are cosmetic, in the sky layer only, and fade with depth like the rest (130).
- Cloud shadows on the ground are out of scope.

## Tests
Deterministic positions for a time and seed, wrap-around, count follows weather density, pooling.
