# 104 - Doodad reactions to bodies (wiggle)

**Priority:** P2 - **Status:** Open - **Depends on:** 103

## Decisions (2026-10-22, from the owner)
- Per-doodad "reacts to bodies" setting (strength, radius, optional spore puff). Mushrooms and grass wiggle when a body walks past. Client-only, cosmetic, nothing on the wire.
- Triggered by players (local and remote) and mobs.

## Proposed design
- Each frame, for on-screen doodads with `reacts`, test overlap with nearby body colliders (use a spatial lookup by cell so cost is bounded).
- On overlap, add an impulse to a damped-spring offset on the doodad's motion (angle for sway, plus an optional particle puff). The spring decays on its own. Direction follows the body's velocity.
- Works with any motion preset (spring adds to the preset's output).

## Tests
Spring decay, direction, trigger radius, mobs and remote players trigger it, no cost when no bodies near.
