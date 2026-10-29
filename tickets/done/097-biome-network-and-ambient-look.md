# 097 - Biome wire format and ambient look

**Priority:** P2 - **Status:** Done (verified by the owner 2026-10-28) - **Depends on:** 095, 096

## Problem
The client needs to know which biome each revealed cell is in so it can tint the background, change the ambient light and (later) pick doodad sets. No music change.

## Decisions (2026-10-22, from the owner)
- Ambient look and light only. No biome BGM yet.

## Proposed design
- Biome definitions (id, key, ambient look) are sent once with the map description. The per-cell biome grid is sent with the map and only for fog-revealed cells (same rule as fluids and gas).
- Client: the background wall tint and the cavern ambient light level blend smoothly between biomes as the camera/player moves (sample the biome weights around the player, ease over about a second). Reuse the existing lighting engine ambient setting; do not add a new light system.
- A debug overlay toggle (like the F3 profiler) shows the biome under the cursor and the blend weights.
- Anything to preload (wall texture) is a `/assets/...` URL.

## Tests
Wire payload only includes revealed cells; client blends ambient between two biomes; no change when only the default exists.

## Built (2026-10-23)
- **Wire:** the state sends `biomes` (index, key, name, ambient) once, and only when the mine has more than the default. Each revealed tile carries `biome` (an index into that list) in the first grid and in `revealedTiles`; hidden cells carry nothing. One-biome mines send nothing new.
- **Client look:** `BiomeAmbient` reads the biome tags of revealed cells within 14 cells of the player (nearer counts more) four times a second and eases towards them (about 95% in a second). It sets the wall tint (multiplies the dirt backdrop), the ambient light (`LightingEngine.setAmbientLight`: lifts every underground depth step towards daylight; 0 keeps today's darkness) and the alpha of each biome's own wall texture (a `TilingSprite` over the dirt backdrop). The lighting engine is reused, no new light system.
- **Debug overlay:** F4 (or `?miningBiomes=1`) shows the blend around the player and the biome under the cursor (revealed cells only).
- **Wall texture** is typed as an `/assets/...` url in the admin (no upload: there is no sanctioned image upload path for it yet).
- Tests: wire tests (nothing for one biome, only revealed cells tagged, tile reveal carries the biome), `BiomeAmbient.test.ts` (sampling, blending, easing, draw-only-on-change, cursor), lighting ambient test, tick handler test, overlay test.

## Owner review (2026-10-23)
- Biome ambient light removed (`ambient.light`, `LightingEngine.setAmbientLight`, the admin slider). The look is the wall tint and wall texture only.
