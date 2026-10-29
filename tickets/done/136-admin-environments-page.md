# 136 - Admin: Environments (and weather) page

**Priority:** P2 - **Status:** Done 2026-10-29 - **Depends on:** 129, 130, 132, 133 (preview needs weather)

## Proposed design
- New admin page like Fluids/Biomes: list, create, edit, delete surface environments.
- Fields: name, weight, sky colors with color pickers, sun, ambient tint, a layers editor (add/reorder layers; texture upload through the existing admin asset route; parallax factor, y offset, tint, scale), allowed weather with weights, props (doodad picker), sound slots via `SoundSlotPicker` (per-slot volume).
- **Live preview:** a scrolling strip with a draggable camera, a weather state picker (clear, cloudy, rain, storm, snow, fog) and a lightning test button, so the owner can judge the look.
- Standard rules: hover states and cursors, errors surfaced, shared loading spinner, a save triggers definition reload (ticket 036).
- `GET/POST/PATCH/DELETE /api/admin/surface-environments` with validation.

## Tests
Route validation and reload, form tests, preview weather controls, error display.

## Built (2026-10-28)
- **Admin "Surface Editor"** (list + detail): key, name, description, weight, default; a Sky panel (two colour pickers, sun on/off with colour/position/height/size, light tint); a Scenery editor (add, reorder far to near, remove; per layer a picture upload or a drawn silhouette, parallax, offset, opacity, tint, scale/shape/height); a Clouds panel (count, band, pictures); a Weather panel (a weight per kind with its share of the time); a Props editor (doodads from the library, floor ones with a gap and per-100 density, air ones as flocks with heights); and the sound slots with the shared `SoundSlotPicker`.
- **Live preview** (`SurfacePreview`): a canvas strip drawn with the same shared maths as the game (sky bands, sun, drifting clouds, scenery by parallax, ground, rain/snow/fog, the dimming light, lightning). Drag it sideways, pick a weather and its strength, call a strike.
- Tests: form mapping both ways and the always-drawable preview environment, every panel, the upload helper, the page (load, save, create, server problems, delete, default rules, not found), the list, the preview drawing and component, the Layout link.

## Decisions (assumed, to confirm)
the editor has no per-weather sound mixing (the three slots follow the weather) and the preview draws clouds, rain and snow in a simple 2D way, not the game's sprites.
