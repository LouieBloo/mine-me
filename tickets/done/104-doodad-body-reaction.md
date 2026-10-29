# 104 - Doodad reactions to bodies (wiggle)

**Priority:** P2 - **Status:** Done (closed by the owner 2026-10-26) - **Depends on:** 103

> 2026-10-26: the player (bullets, swings, explosions, falling rocks) can now also hurt and kill doodads that have health; see 143.

## Decisions (2026-10-22, from the owner)
- Per-doodad "reacts to bodies" setting (strength, radius, optional spore puff). Mushrooms and grass wiggle when a body walks past. Client-only, cosmetic, nothing on the wire.
- Triggered by players (local and remote) and mobs.

## Proposed design
- Each frame, for on-screen doodads with `reacts`, test overlap with nearby body colliders (use a spatial lookup by cell so cost is bounded).
- On overlap, add an impulse to a damped-spring offset on the doodad's motion (angle for sway, plus an optional particle puff). The spring decays on its own. Direction follows the body's velocity.
- Works with any motion preset (spring adds to the preset's output).

## Tests
Spring decay, direction, trigger radius, mobs and remote players trigger it, no cost when no bodies near.

## Built (2026-10-24, stage 4)
- **Pure logic in shared** (`packages/shared/src/gameLogic/doodad/`):
  - `doodadBodies.ts`: `DoodadBody` (id, cell position, cells/s velocity, half-width) and `DoodadBodyIndex`, a bucketed lookup (4-cell buckets) built once a frame; `near(x, y, radius)` costs the nearby buckets only and nothing with no bodies.
  - `doodadReaction.ts`: the damped spring (`stepSpring`: about one swing a second, gone in two, clamped to 0.7 rad), `pushDirection` (floor and air lean the way the body goes, ceiling swings the other way, wall is pushed up or down and respects the mirror), `reactionDrive` (stronger the closer and faster, zero below 0.5 cells/s so standing still does nothing, full force at 5 cells/s) and `DoodadReactionSystem` (springs only for doodads being brushed or still swinging; a doodad at rest leaves the map; one that is no longer offered is dropped).
  - **Puff:** one puff when a moving body comes into reach (not every frame), then a 1.5 s cooldown.
- **Client:** `systems/DoodadBodies.ts` gathers the local player, remote players and mobs (`DoodadBodyTracker` works a velocity out for those that report only a position, steadied, and counts a jump of more than 4 cells as a move, not a walk); `DoodadRenderer.update(time, rect, dt, samples)` runs the reactions and adds the spring angle to the doodad's rotation (whole body and multi-part doodads alike, after the motion preset, so it works with every preset). The ticker only gathers bodies while a doodad on screen reacts or wanders (`needsBodies`). The puff goes through `DoodadEffects.puff`, which spawns the doodad's named effect where it gives off its particles.
- `MiningRemotePlayerRenderer.getPlayers()` and `MiningMobRenderer.getMobs()` added for the lookup.
- Tests: shared bodies and reaction tests (spring decay and limit, directions per anchor, falloff, strength, min speed, leaning each way, puff once and after the cooldown, forgetting), client renderer tests (lean from the player, a remote player or mob that reports only where it is, far and still bodies ignored, adds to sway, puff once, `needsBodies`), `DoodadBodies.test.ts`. Mutation-checked: removing the minimum speed and the "puff once" rule each fail a test.

## Decisions (assumed, to confirm)
- **Standing next to a doodad does nothing;** it has to be walked past (more than 0.5 cells per second).
- **Strength 1 leans a doodad about 40 degrees at most** (0.7 rad), at full walking speed right next to it; strength scales the push.
- **A body's own width counts** towards reaching a doodad (the radius is measured to the body's edge).
- **Puff cooldown 1.5 s**, and the puff plays from the doodad's particle offset.
