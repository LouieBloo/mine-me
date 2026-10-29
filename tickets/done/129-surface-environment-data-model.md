# 129 - Surface environment data model and loader

**Priority:** P2 - **Status:** Done 2026-10-29 - **Depends on:** none (first of the surface epic 129-137)

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

## Built (2026-10-28)
- **Data:** `SurfaceEnvironment` table (key, name, weight, isDefault, sky, ambientTint, layers, clouds, weather, props, soundEffects; JSON columns, additive `db push`), shared `SurfaceEnvironmentDefinition` (`types/surface.ts`), `validateSurfaceEnvironment`, `DEFAULT_SURFACE_ENVIRONMENT` (a plain blue day with a sun, so a run always has a sky) and `pickSurfaceEnvironment(seed, envs)` (weighted, deterministic, order-independent, default fallback).
- **Loader:** `definitionLoaders` (+ `attachSurfaceSounds`, `toSurfaceEnvironment`), `MiningDataManager.getSurfaceEnvironments()/getSurfaceEnvironment()`, reload after every admin save (`/surface-environments` prefix), dev mirror `surface_environments.json`.
- **Per run:** `MiningSurfaceState` (server) picks the environment from the run seed (the sandbox starts on the default one so a bug can be reproduced), and the session state carries `surface` once: environment, seed, weather clock start, server time, and any sandbox override. A late joiner gets the same facts.
- **Admin:** `GET/POST/PUT/PATCH/DELETE /api/admin/surface-environments`, picture upload `POST .../:id/images/:name` (versioned urls so a re-upload shows at once), `PATCH .../:id/sound-effects/:slot`. One default always exists (it cannot be switched off or deleted).
- **Data applied to the dev DB** (`prisma/add-first-surface.ts`, dry run first): three environments (Green Valley, the default; Snowfield; Dusty Plains) and four surface doodads.
- Tests: shared rules and pick, loader, data manager, controller routes (create/update/default/delete/validation/props references/uploads), engine session state.

- Sounds are three slots on the environment (rain, wind, thunder) through the shared sound library with a per-slot volume, like every other sound.
- Props name doodads by key; only floor and air doodads are accepted (the server checks).
- An environment's layers are limited to 6, props to 20, clouds to 24 (cost caps).
