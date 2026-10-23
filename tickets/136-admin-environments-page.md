# 136 - Admin: Environments (and weather) page

**Priority:** P2 - **Status:** Open - **Depends on:** 129, 130, 132, 133 (preview needs weather)

## Proposed design
- New admin page like Fluids/Biomes: list, create, edit, delete surface environments.
- Fields: name, weight, sky colors with color pickers, sun, ambient tint, a layers editor (add/reorder layers; texture upload through the existing admin asset route; parallax factor, y offset, tint, scale), allowed weather with weights, props (doodad picker), sound slots via `SoundSlotPicker` (per-slot volume).
- **Live preview:** a scrolling strip with a draggable camera, a weather state picker (clear, cloudy, rain, storm, snow, fog) and a lightning test button, so the owner can judge the look.
- Standard rules: hover states and cursors, errors surfaced, shared loading spinner, a save triggers definition reload (ticket 036).
- `GET/POST/PATCH/DELETE /api/admin/surface-environments` with validation.

## Tests
Route validation and reload, form tests, preview weather controls, error display.
