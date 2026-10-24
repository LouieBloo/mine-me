# 106 - Wandering doodads (bugs)

**Priority:** P3 - **Status:** Built, waiting for you to try it (needs doodads with art or placeholders in the database) - **Depends on:** 103

## Decisions (2026-10-22, from the owner)
- Simple client-side wandering is included for bugs: a doodad may have a small wander/flutter motion inside a radius of its anchor. Purely cosmetic, not synced, not interactable.

## Proposed design
- A `wander` setting in the doodad row: `mode` (CRAWL along surface, FLUTTER in air, HOP), `radius`, `speed`, `pauseMs`. Implemented as another motion preset family in the same registry as 103, with a client-side seeded random so it is repeatable.
- Crawlers stay on their anchor surface (use the cell grid so they don't walk through blocks); flutterers stay within `radius` of the anchor and avoid solid cells.
- Fireflies/dust use the AIR anchor; they can carry the light config so they light up as they move.
- Mobs and players can spook them (reuse 104's trigger) so they scatter and return.

## Tests
Wander stays within radius and out of solid cells; deterministic with seed; spook and return.

## Built (2026-10-24, stage 4)
- **Pure logic in shared** (`doodadWander.ts`): `stepWander(state, wander, subject, terrain, dt, spookFrom)` moves a `WanderState` one frame; the modes are one registry, `DOODAD_WANDER_BEHAVIOURS` (CRAWL, FLUTTER, HOP: whether it hops, whether it clings, which ways it can go, which way a hop lifts), so a new mode is one entry. Random numbers come from a seed made from the doodad's cell (`wanderSeed`), so a bug wanders the same way each time and no clock or `Math.random` is used.
  - **CRAWL** walks along its surface (x for a floor or ceiling bug, y for a wall bug) and only ever stands where its footprint is clear and still against the surface (`canStandAt`), so it never leaves the floor, walks off a ledge or into a block. **FLUTTER** drifts in any direction, only keeping out of solid cells. **HOP** crosses the same ground in bounces of at most 1.5 cells, 0.7 cells high, lifting away from its surface, and rests `pauseMs` between trips.
  - A trip is cut short at the first cell it could not stand in (`clampPath`), and never goes further than `radius` from the placed spot.
  - **Scared** (a moving body within the reach, or any body right on top of it): it drops what it was doing and runs the way that gets it furthest from the body (at 2.5x speed, no pauses between hops), waits 1.5 s where it ended up, goes back to its spot as far as the way is open, and carries on. Cornered (it can't get a cell further away) it stays put.
- **Client:** `DoodadRenderer` gives each wandering doodad a `WanderState` while it is on screen, steps it each frame with the grid terrain (`gridWanderTerrain`: solid blocks, unseen cells and the map's edge block it), carries `view.root` to where it has walked and flips the picture to face the way it goes (a wall bug keeps its side). A bug starts from its placed spot each time it comes back on screen. It uses the doodad's `reacts.radius` as the scare radius if it has one, else 2 original blocks; the same body lookup as the reactions. `DoodadEffects.followWanderers` moves a wandering doodad's light and emitter with it every frame.
- Validation: `validateDoodad` now refuses CRAWL and HOP on an AIR doodad (nothing to cling to); an AIR doodad can FLUTTER.
- Tests: shared wander tests (standing places for each anchor, paths cut short, crawling stays on its surface / within the radius / off ledges, wall crawling, fluttering keeps out of blocks, hopping lifts and lands, determinism by seed, a long frame counts as a short one, scared: runs away, the other way, scatters and goes home and wanders again, cornered, a hopper), client renderer tests (walks along its surface within the radius, stays put without terrain, is scared by a body, moves its position, faces the way it goes), effects tests (light and emitter follow it). Mutation-checked: no clamp on the picked path and no scare response each fail tests.

## Decisions (assumed, to confirm)
- **Bugs reset to their placed spot when they come back on screen** (no memory off screen).
- **Scare radius 2 original blocks by default,** or the doodad's own reaction radius when it has one; a still body only scares a bug within half that.
- **Facing:** the picture is assumed to face right; it is flipped when the bug heads left.
- **Hops** are 1.5 cells long and 0.7 high; flee speed is 2.5x.
- **Wander and reactions are independent:** a bug with `reacts` also leans when brushed.
