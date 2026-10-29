# 133 - Rain, snow, fog and wind effects

**Priority:** P2 - **Status:** Done 2026-10-29 - **Depends on:** 131, 132

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

## Built (2026-10-28)
- **`WeatherParticles`**: a hard-capped pool (360 rain streaks, 220 snowflakes, 48 splashes, 4 fog bands) in the world container in front of everything on the surface. Rain and snow fall between the top of the view and the horizon only (never into the mine, shafts included); a streak that lands spawns a splash on the ground row; wind slants the rain and sways the snow; counts follow the weather's intensity and the view width.
- Nothing is updated and the layer is hidden when the sky is not in view or the camera is deep (`fade`).
- **Wind and doodads:** `DoodadRenderer.setWeather(type, windSway)` multiplies the sway of the doodads standing above the ground by `windSwayMultiplier(weather, clock)` (1 + 2.5 x wind x gust); underground doodads are untouched.
- `rainIntensity` is exposed on `WeatherState` for a later wet-surface or fire-dousing ticket; this ticket has no gameplay side effects (a test checks it).
- Tests: spawn count follows intensity and caps, stays above the ground, snow too, hidden underground and when faded, slant either way, splashes on the ground row, fog bands, no side effects; renderer wind sway above vs below the ground.

## Decisions (assumed, to confirm)
the particles are a light pooled system of their own rather than the `ParticleEngine`/`ParticleEffect` rows (the engine is tied to world cells and pays per emitter; weather needs a few hundred cheap streaks), so a weather particle effect is not editable in the admin yet.
