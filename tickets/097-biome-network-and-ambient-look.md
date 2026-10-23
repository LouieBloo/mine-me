# 097 - Biome wire format and ambient look

**Priority:** P2 - **Status:** Open - **Depends on:** 095, 096

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
