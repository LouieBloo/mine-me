# 101 - Doodad wire format and fog reveal

**Priority:** P1 - **Status:** Open - **Depends on:** 099, 100

## Proposed design
- Doodad definitions are sent once with the map description (static data once, not every tick).
- Placements are sent once per map, only for cells the player has revealed; newly revealed cells send their doodads as part of the existing reveal delta (`takeVisibleChanges` pattern). Hidden doodads are never sent.
- Compact placement form: `[typeIndex, x, y, variant]` plus size only if non-default (mirror the piece offset encoding).
- Removal deltas: a doodad id/anchor cell list when its anchor is mined or blown up (ticket 105).
- Multiplayer: all players see the same doodads; late joiners get the current list.

## Tests
Reveal only sends revealed doodads; removal delta; late join; payload size budget on a full 135x135 map.
