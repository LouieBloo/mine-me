# 098 - Admin: Biomes page

**Priority:** P1 - **Status:** Open - **Depends on:** 095, 096

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
