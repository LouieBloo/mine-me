# 098 - Admin: Biomes page

**Priority:** P1 - **Status:** Built, waiting for you to try it - **Depends on:** 095, 096

## Problem
The owner must create and tune biomes without touching code or the DB.

## Proposed design
- New admin page like Fluids/Gases: list, create, edit, delete (the default biome cannot be deleted).
- Fields: name/key, depth window, weight, noise scale, block palette weights, fluid and gas weights, mob spawn weights, ambient tint/light/wall texture.
- **A live preview**: a small map-slice preview that generates a strip with the current settings so blending and size can be judged (reuse the sandbox/fluid preview approach).
- Standard rules: hover states and cursors, errors surfaced to the user, shared loading spinner, saves trigger the definition reload (ticket 036).
- A `GET/POST/PATCH/DELETE /api/admin/biomes` route family with validation (depth min <= max, weights >= 0).

## Tests
Route validation and reload; component tests for the form; error display.

## Built (2026-10-23)
- **API:** `GET/POST/PUT/PATCH/DELETE /api/admin/biomes` (+ `/:id` by id or key). Validation is the shared `validateBiome` plus a check that every block, fluid, gas and mob named exists. The first biome ever created becomes the default; making another the default takes the role over; the default cannot be deleted or un-defaulted. Saves mirror to `biomes.json` and trigger the definition reload (`/biomes` is in `DEFINITION_ROUTE_PREFIXES`; `/biomes/preview` is excluded, it stores nothing).
- **Pages:** `Biomes` (list) and `BiomeDetail` (form) in the admin sidebar under Items & Economy ("Biomes Editor"), with the reusable `WeightTable`, `BlockSwapsEditor`, `BiomeAmbientPanel`; depths shown in original blocks beside the field.
- **Preview:** `POST /api/admin/biomes/preview` generates a real strip (135x80 by default) with the biomes as edited (saved or not), so it shows what the generator makes: blocks, fluid and gas, or just the regions, with the share each biome covers, a new-seed button and its own softness slider.
- Tests: route tests (validation, references, default rules, partial updates, preview), component tests for every new component and page.

## Owner review (2026-10-23)
- Wall texture is now uploaded (`POST /api/admin/biomes/:id/wall-texture`, saved under `sprites/biomes/`, same shape as the extractor art upload); the url field stays for existing assets. Upload needs a saved biome.
- The Look panel no longer has a light slider. The Mine Generator Biome card has the per-map biome weight table.
