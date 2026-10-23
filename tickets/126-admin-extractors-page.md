# 126 - Admin: Extractors page and item weight field

**Priority:** P2 - **Status:** Open - **Depends on:** 117, 119

## Proposed design
- New admin page like Fluids: list, create, edit extractors (texture upload through the existing asset route, sound slots via `SoundSlotPicker`, particle picker, all rates and health fields).
- Item form gets the `weight` field; a bulk view lists items and weights for tuning.
- Preview: the extractor landing and a short belt with items travelling, so rates can be judged (like the fluid preview).
- Standard rules: hover states and cursors, errors surfaced, shared loading spinner, save triggers definition reload (ticket 036).
- `GET/POST/PATCH/DELETE /api/admin/extractors` with validation.

## Tests
Route validation and reload, form tests, error display.
