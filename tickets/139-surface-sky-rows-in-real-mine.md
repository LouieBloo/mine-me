# 139 - Sky rows above the ground in the real mine

**Priority:** P1 - **Status:** Open - **Depends on:** none (blocks 120, 130, 135; found in the 2026-10-22 audit)

## Problem
The real mine's grid is 135x135 with the ground starting at row 0 (`ENTRANCE_Y` = 0, `surfaceRow` = 0); only the sandbox has open sky rows above the ground (`SandboxMapBuilder` returns `surfaceRow: skyRows`, and `LightingEngine` and `useMiningScene` already honour `surfaceRow`). Several new tickets assume there is sky above the ground: the extractor lands on the surface (120), the belt starts there (122), trees, birds and mountains stand on it (130, 135), and clouds and weather fill the space above it (131-134). There is currently nowhere to put them.

## Proposed design (to confirm with the owner)
- Add N empty sky rows above the ground in the real mine by giving it a `surfaceRow` like the sandbox, so everything above `surfaceRow` is open air and the ground starts at `surfaceRow`. Reuse the sandbox's mechanism instead of inventing one.
- Everything measured in rows (depth, mission depth, biome depth windows, generation ranges) must be relative to `surfaceRow`, not row 0. Audit `y`-based rules: entrance zone, rock/fluid/gas depth bands, mob spawn depth, `REACH_DEPTH` (109), biome depth windows (095), fall-damage and fluid surface rules.
- Sky rows are cheap: no blocks, no fluid or gas simulation, no fog (always visible), and excluded from the minimap and network grid where possible.
- Choose N so the camera at the surface sees sky and the extractor, tree and landing animation have room (decided: 8 original blocks = 24 small blocks). Make it a map config value on the Mine Generator page.
- Camera and bounds: the camera top bound moves up with the sky; the player cannot leave through the top; jumping is limited by existing physics.
- Existing saved maps or sessions: confirm whether any map is persisted. If so, they need the row offset (a dry-run-by-default script).

## Decisions (2026-10-22, from the owner)
- **Sky height:** about one screen, 8 original blocks (24 small blocks, `8 * BLOCK_SCALE`). A map config value on the Mine Generator page so it can be tuned.
- **Sky is open air, bounded by the map top.** Players can jump and stand on the surface; it is real empty space like the sandbox's sky rows, not an invisible ceiling.
- **Exit rule is unchanged** (stand on the ground at the top-center, measured from `surfaceRow`), **plus a visible exit marker/sign** on the surface so the exit spot is clear. The marker is cosmetic and reuses the doodad system (a floor doodad placed at the entrance by the generator, not clickable), with a sprite for Gemini (add to ticket 137's list).

## Tests
Entrance/exit still works with `surfaceRow` > 0; generation depth rules are relative to `surfaceRow`; sky rows are empty and not simulated; client camera bounds; mission depth uses depth below the surface. Mutation: treat row 0 as the surface -> a depth test fails.
