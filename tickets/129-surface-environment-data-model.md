# 129 - Surface environment data model and loader

**Priority:** P2 - **Status:** Open - **Depends on:** none (first of the surface epic 129-137)

## Problem
The surface is a flat blue. We want a real background: sky, clouds, mountains and hills, trees, birds and weather. All cosmetic, simple but effective, since the owner makes the art with Gemini and has little art experience.

## Decisions (2026-10-22, from the owner)
- **An environment is a data row** (like a biome or fluid): scenery layers, sky colors, allowed weather with weights, and prop lists. A new environment (forest, desert, snowy mountains) is a row plus uploaded images, no code.
- **Always daytime.** No time-of-day cycle in v1; a sun is part of the sky.
- **Independent of the underground biomes** for now. Later a map or mission can name an environment; there is no coupling in v1.
- **Purely cosmetic**, but leave a hook for rain to feed fluids/fire later (see 134).
- Surface only; everything fades out as the player goes down (130).

## Proposed design
- `SurfaceEnvironment` table: `key`, `name`, `weight`, sky colors (top / horizon, plus sun color and position), `ambient` surface tint, `layers` (JSON list: `textureUrl`, `parallaxFactor`, `yOffset`, `tint`, `scale`, `repeatX`), `weather` (JSON: weather type id -> weight, plus allowed transitions), `props` (doodad ids with density, see 136), `soundEffects`, `isDefault`.
- Shared type `SurfaceEnvironmentDefinition`; loader in `definitionLoaders`, reloaded after admin save; JSON dev mirror only.
- The run picks an environment by weight from the run seed (server), sent once with the map description. A default environment always exists (flat gradient, no art) so a run never has nothing.
- Textures are `/assets/...` URLs so the preloader finds them.

## Tests
Loader, default fallback, weighted pick is deterministic per seed, layer validation (parallax in 0-1, texture present).
