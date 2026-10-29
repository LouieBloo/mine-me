# 099 - Doodad data model, loader and admin page

**Priority:** P1 - **Status:** Done (closed by the owner 2026-10-26) - **Depends on:** 095 (biome table)

## Problem
The mine is visually empty. Doodads are purely environmental decoration: mushrooms, grass, dripping caves, bugs, crystals, moss. They live in the background and are drawn behind the character. (2026-10-26: they are no longer untouchable: see 143, where creatures can be killed and ceiling doodads fall.) A future "mushroom item" would be a separate thing.

## Decisions (2026-10-22, from the owner)
- **Generated and anchored to surfaces.** Anchors: floor (on top of a block), ceiling (under a block), wall (side of a block), and free-floating in open air.
- **Variable-size pieces** using the existing piece pattern (`pieceCells`, `pieceFootprint`, `clearPieceSiblings`); a doodad has a footprint in small blocks and may come in several sizes.
- **Behaviours in v1:** static sprite, animation (see 103), light, particles and sound.
- **Reactions:** walk-by wiggle (cosmetic, client-only) and removal when the anchor block is mined or blown up (see 104, 105).
- **Bugs** are doodads with an optional small client-side wander (see 106).
- **Doodads are assigned to biomes** with a per-biome weight (a doodad can appear in several biomes).
- **Art:** the owner will generate images with Gemini per `ART_STYLE_GUIDE.md`; no spritesheets. Doodad art is a single image (or a few part images) with pivots; motion is procedural (see 103).
- **Wire format:** a static list once per map, revealed by fog; removal arrives as small deltas.

## Proposed design
- `Doodad` table (open `key`, not an enum): `name`, `anchor` (FLOOR/CEILING/WALL/AIR), footprint (width/height in blocks) and optional size variants with weights, `textureUrl` (`/assets/...`), `parts` / pivot data, `zOffset`, `motion` (JSON preset, ticket 103), `reacts` (JSON: strength, radius; ticket 104), `light` (reuse `ItemLightConfig`), `particleEffectId` (+ offset) and `soundEffects` (via the sound library with a per-slot `volume`, slots defined once like `MOB_SOUND_SLOTS`), `wander` (ticket 106), `spawn` rules (ticket 100).
- `DoodadBiome` link: `doodadId`, `biomeId`, `weight`, `density`.
- Shared type `DoodadDefinition`, loader in `definitionLoaders` (reloaded after admin save), JSON dev mirror only.
- Admin page: list, create, edit; texture upload through the existing asset upload route (no one-off uploader); sound slots use the shared `SoundSlotPicker`; light uses the `ItemLightEffectConfig` panel; particle picker uses the existing `ParticleEffect` rows; biome assignment table.
- The admin page includes a preview (see 107).

## Tests
Loader, validation (footprint >= 1, anchor valid), admin route and form tests.

## Decisions (assumed, to confirm) - 2026-10-24
Recorded while building without the owner; the questions are also in `done/doodad-open-questions.md`.
- A new doodad defaults to a 3x3 footprint (one original block), FLOOR anchor, draw order 0. `sizeVariants`, when present, are the only sizes picked from (list the base size too if it should stay possible); with none, the doodad is always its own footprint.
- Parts reuse the `SkeletonPartDef` naming for pivots (`pivot_anchor`, `offset_from_anchor`, `z_index`), in pixels of the part's own picture; `name` is what the motion presets address.
- Sound slots (`DOODAD_SOUND_SLOTS`): `ambient` (can loop), `react` (brushed by a body), `break` (anchor removed). Each stores its own volume like every other slot.
- Spawn rules are `{ minDepth, maxDepth, blocks, nearFluids, nearGases, nearRadius, darkOnly, minSpacing }`, all optional; depths and distances in small blocks; `nearRadius` defaults to 2 original blocks.
- Biome links live on the doodad payload (`biomes: [{ biomeId | biomeKey, weight, density }]`); sending the list replaces it in one write, leaving it out keeps the links. No separate link endpoints.
- Pictures: `POST /api/admin/doodads/:id/texture` sets the main texture; `POST .../images/:name` saves a named extra picture (a part, or one size) and returns its url without touching the row. Files are named `<key>.png` / `<key>-<name>.png`.
- The motion preset name is stored as an open string; it is checked against the registry in ticket 103, not here.
- No public REST endpoint (biomes, gases and extractors have none either): the client gets the definitions with the map (ticket 101).
- No doodad rows were created: there is no art yet. `doodads.json` is an empty mirror.

## Built (2026-10-24)
- **Schema:** `Doodad` and `DoodadBiome` (cascade delete both ways; the particle effect is `SetNull`) in `apps/server/prisma/schema.prisma`, pushed additively to the dev DB.
- **Shared** (`packages/shared`): `types/doodad.ts` (`DoodadDefinition`, `DoodadClientDefinition` + `toClientDoodad`, anchors, `doodadSizeChoices`, `validateDoodad` and one validator per JSON column), `sound/DoodadSoundProfile.ts` (`DOODAD_SOUND_SLOTS`, `normalizeDoodadSoundRefs`, `resolveDoodadSounds`), sound types in `types/sound.ts`. Tests: `types/doodad.test.ts`, `sound/__tests__/DoodadSoundProfile.test.ts`. Mutation checked: dropping the footprint rule fails two tests.
- **Loader:** `definitionLoaders.ts` loads doodads with their biome links (`toDoodadDefinition`, `attachDoodadSounds`); `MiningDataManager` has `getDoodads()` / `getDoodad(keyOrId)`; the dev mirror `data/doodads.json` is read by `loadDefinitionsFromFiles`.
- **Admin REST** (`controllers/admin/doodad.controller.ts`, `doodadSound.controller.ts`, routes in `routes/admin.ts`): list, get, create, update (PUT/PATCH), delete, texture and image uploads, `PATCH /doodads/:id/sound-effects/:slot`. Every save is validated with the shared rules plus a reference check (blocks, fluids, gases, particle effects, biomes must exist) and mirrored to `doodads.json`. `/doodads` is in `DEFINITION_ROUTE_PREFIXES`, so saves reload the definitions. The Sounds page usage list shows doodad slots.
- **Tests:** `tests/admin.doodad.test.ts`, `tests/admin.doodadSound.test.ts`, `tests/soundUsageDoodad.test.ts`, `definitionLoaders.test.ts` (doodads), `definitionReloadMiddleware.test.ts`. Mutation checked: skipping the block reference check, and not replacing the biome list, each fail a test.

## Admin page built (2026-10-24, stage 5)
- **List** (`pages/Doodads/Doodads.tsx`, nav "Doodads Editor", routes `/doodads` and `/doodads/:id`): picture, key, name, anchor, size and depth in original blocks, biomes.
- **Editor** (`pages/Doodads/DoodadDetail/`), each panel its own folder with tests: key/name/description, anchor, footprint + draw order, `DoodadSizeVariantsEditor`, `DoodadArtPanel` (main picture upload through `POST /doodads/:id/texture`, parts with pivot/offset/layer and per-part upload through `.../images/:name`, size filled from the file), `DoodadMotionPanel` (presets from the shared registry, speed/amplitude/phase, extra numbers incl. `weight_<part>`), `DoodadBehaviourPanel` (reacts + wander, AIR can only flutter), `DoodadEffectsPanel` (the shared `ItemLightEffectConfig` + particle picker), `DoodadSpawnPanel` (depth, blocks/fluids/gases via `KeyChips`, near radius, dark only, spacing), `DoodadBiomeLinks` (weight + density per biome), `DoodadSoundEffects` (the shared `SoundSlotPicker`, `DOODAD_SOUND_SLOTS`, per-slot volume).
- `pages/Doodads/doodadForm.ts`: form <-> `DoodadDefinition`, `previewDoodad` (half-typed values made safe for the preview), `tidySpawn`.
- Saving validates with the shared `validateDoodad` first; the server's reasons are listed under the form. Pictures and sounds need a saved doodad (they save straight away).

## Decisions (assumed, to confirm) - stage 5
- Biome links use their own two-number table (weight + density), not the single-number `WeightTable`.
- Sound uploads from the doodad's picker are filed under the `GENERAL` library category (there is no DOODAD category; it is only a filter label).
- Moving a doodad to AIR turns a CRAWL/HOP wander into FLUTTER instead of showing a validation error.
- A part's size and pivot (bottom middle) are filled in from the uploaded file when the browser can read it.
