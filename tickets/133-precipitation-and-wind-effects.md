# 133 - Rain, snow, fog and wind effects

**Priority:** P2 - **Status:** Open - **Depends on:** 131, 132

## Decisions (2026-10-22, from the owner)
- Rain, snow, fog and wind are all in v1. Surface only; precipitation stops at the ground and does not fall into the mine (shafts included).

## Proposed design
- Reuse the existing particle system and `ParticleEffect` rows where possible: a weather type's particle preset references `ParticleEffect` ids (rain streaks, snow flakes), with intensity scaling the spawn rate.
- Particles live in a screen-space emitter above the surface row, so cost doesn't grow with the map; cap the count (profiler line "weather particles").
- Rain: streaks plus small splash particles where they hit the surface row (and on the extractor roof, optional). Snow: slow drift with sway. Fog: a few wide soft bands across the horizon. Wind: sideways drift on particles, plus a small sway multiplier fed to surface doodads (trees, grass) via the doodad motion system.
- Gameplay hook only (no behavior): `weatherAt(...)` exposes `rainIntensity` so a later ticket can add water or douse fire on the surface (owner wants this possible later).
- Fades with depth like everything on the surface.

## Tests
Spawn rate follows intensity, particles cap, nothing spawns underground, wind multiplier is exposed, no gameplay side effects.
