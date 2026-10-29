# 134 - Lightning, thunder and weather lighting

**Priority:** P2 - **Status:** Done 2026-10-29 - **Depends on:** 132, 133

## Decisions (2026-10-22, from the owner)
- **Weather tints and dims the surface ambient light; lightning briefly flashes it.** Underground is unaffected.
- **Sound** goes through the sound library: ambient loops per weather state (rain, wind) and thunder, assigned on the weather/environment rows with a per-use volume (`withVolume`), faded and muffled with depth. No new uploader.

## Proposed design
- Lightning: at the seeded strike times (132) draw a short bolt sprite or procedural jagged line in the sky and flash the sky and the lighting engine ambient (a fast spike and decay, 2 quick pulses). Thunder plays after a delay proportional to a seeded distance.
- Lighting: use the lighting engine's existing ambient setting. Do not add a second light system. Weather offsets (dim, tint) come from the registry and blend with the environment ambient.
- Photosensitivity: a "reduce flashes" client setting that caps flash brightness.
- Sounds: slots defined once like `MOB_SOUND_SLOTS` (rain loop, wind loop, thunder); loops start/stop with the weather state and fade with depth.

## Tests
Flash timing matches the seed, ambient returns to baseline, flash cap setting, underground ambient untouched, sound volume uses the per-use volume.

## Built (2026-10-28)
- **Lightning** (`lightningAt`, `strikesBetween`, shared and seeded like the weather): a strike roll in 3-second slots, more likely the more storm there is; each strike has a place across the sky, a distance and a thunder delay (0.35 to 5.35 s); a flash is a sharp pulse and a smaller second pulse. `LightningRenderer` draws the sky flash and a jagged seeded bolt (drawn once per strike).
- **Sky light:** `LightingEngine.setSkyLight(color)` tints the sky part of the lightmap (its own graphics, so no redraw of the underground ambient); the weather's dim and tint, the environment's ambient tint and the flash combine in `skyLightColor`, rounded to steps of 4 per channel so the lightmap is only redrawn when it visibly changed. Underground ambient is never touched.
- **Photosensitivity:** a Display section in Game Settings, "Reduce Lightning Flashes" (stored in the browser): caps the flash at 25% and skips the bolt.
- **Sounds:** `SurfaceSounds` plays the rain and wind loops (volume = slot volume x weather intensity x depth fade, in steps) and thunder after each strike (later for far strikes, quieter with distance), all through the environment's rain/wind/thunder slots with the per-slot volume (`withVolume`). Thunder that is overdue (a hidden tab) is dropped.
- Tests: strike timing and the same strikes however the range is cut, flash envelope, bolt drawn once, caps, the settings store and modal toggle, sky light changes only the sky, sound loops/thunder/depth.

## Decisions (assumed, to confirm)
"muffled with depth" is only a fade (the sound manager has no filter); the lightning bolt needs no art.
