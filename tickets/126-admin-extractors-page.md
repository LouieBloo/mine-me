# 126 - Admin: Extractors page and item weight field

**Priority:** P2 - **Status:** Done in code (try it by hand) - **Depends on:** 117, 119

## Proposed design
- New admin page like Fluids: list, create, edit extractors (texture upload through the existing asset route, sound slots via `SoundSlotPicker`, particle picker, all rates and health fields).
- Item form gets the `weight` field; a bulk view lists items and weights for tuning.
- Preview: the extractor landing and a short belt with items travelling, so rates can be judged (like the fluid preview).
- Standard rules: hover states and cursors, errors surfaced, shared loading spinner, save triggers definition reload (ticket 036).
- `GET/POST/PATCH/DELETE /api/admin/extractors` with validation.

## Tests
Route validation and reload, form tests, error display.

## Progress (2026-10-22)
- Server: `GET/POST/PUT/DELETE /api/admin/extractors` with the shared `validateExtractor` (all problems reported at once, a partial update is checked as it would be afterwards, key fixed after creation, one default at a time), `POST /extractors/:id/texture/:part` (body or belt picture, saved under `assets/sprites/extractors/` through the `assetPaths` helpers), `PATCH /extractors/:id/sound-effects/:slot` (library sound + per-slot volume), and `PATCH /items/:id/weight` for the bulk screen (changes only the weight, so item effects are never touched). Saves reload the running definitions through the existing admin reload middleware, and mirror `extractors.json`.
- Admin: **Extractors** list and detail pages (all rates and health, landing dust picker, art upload, `SoundSlotPicker` sound slots, default flag, delete with confirmation), a live **preview** (`ExtractorPreview`: the landing, the belt digging and a player unloading, played from the same numbers, including unsaved edits), and an **Item Weights** page (filter, edit and save one weight at a time). New sound category `EXTRACTOR`. The item form already had the weight field (117).
- Sound-slot volume, hover states and cursors, error toasts and the shared loading spinner follow the other screens.
