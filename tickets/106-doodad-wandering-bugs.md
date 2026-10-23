# 106 - Wandering doodads (bugs)

**Priority:** P3 - **Status:** Open - **Depends on:** 103

## Decisions (2026-10-22, from the owner)
- Simple client-side wandering is included for bugs: a doodad may have a small wander/flutter motion inside a radius of its anchor. Purely cosmetic, not synced, not interactable.

## Proposed design
- A `wander` setting in the doodad row: `mode` (CRAWL along surface, FLUTTER in air, HOP), `radius`, `speed`, `pauseMs`. Implemented as another motion preset family in the same registry as 103, with a client-side seeded random so it is repeatable.
- Crawlers stay on their anchor surface (use the cell grid so they don't walk through blocks); flutterers stay within `radius` of the anchor and avoid solid cells.
- Fireflies/dust use the AIR anchor; they can carry the light config so they light up as they move.
- Mobs and players can spook them (reuse 104's trigger) so they scatter and return.

## Tests
Wander stays within radius and out of solid cells; deterministic with seed; spook and return.
