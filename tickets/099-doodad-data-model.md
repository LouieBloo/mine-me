# 099 - Doodad data model, loader and admin page

**Priority:** P1 - **Status:** Open - **Depends on:** 095 (biome table)

## Problem
The mine is visually empty. Doodads are purely environmental decoration: mushrooms, grass, dripping caves, bugs, crystals, moss. They live in the background, are never interactable and are drawn behind the character. A future "mushroom item" would be a separate thing.

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
