# 101 - Doodad wire format and fog reveal

**Priority:** P1 - **Status:** Built, waiting for you to try it (server and the client's receiving side; drawing is 102) - **Depends on:** 099, 100

## Proposed design
- Doodad definitions are sent once with the map description (static data once, not every tick).
- Placements are sent once per map, only for cells the player has revealed; newly revealed cells send their doodads as part of the existing reveal delta (`takeVisibleChanges` pattern). Hidden doodads are never sent.
- Compact placement form: `[typeIndex, x, y, variant]` plus size only if non-default (mirror the piece offset encoding).
- Removal deltas: a doodad id/anchor cell list when its anchor is mined or blown up (ticket 105).
- Multiplayer: all players see the same doodads; late joiners get the current list.

## Tests
Reveal only sends revealed doodads; removal delta; late join; payload size budget on a full 135x135 map.

## Built (2026-10-24, stage 2)
- **Definitions once:** `MiningSessionClientState.doodads` (`DoodadClientDefinition[]`, from `MiningDoodadSubsystem.clientDefinitions()`, sent with the map like biomes/gases; absent when there are none). A placement's `typeIndex` is an index into this list (key order).
- **Placements:** `doodadPlacements` in the session state (the revealed ones, row by row) and `doodadsAdded` in each tick, as `[typeIndex, x, y, variant]` plus a fifth `1` only for a mirrored wall doodad. No size on the wire: it is the definition's size choice `variant`. A doodad is sent when any cell of its footprint is revealed (`revealAndTrackTiles` calls `onTileRevealed`); hidden doodads are never sent. Fog is shared in the room, so one list serves all clients; a late joiner gets the snapshot of everything revealed so far.
- **Removals:** `doodadsRemoved` in the tick, `[x, y]` of the footprint's top-left cell. A client applies additions first, then removals. A doodad nobody had seen goes silently.
- **Client:** `DoodadField` (shared, pure, tested) holds definitions and entries (by origin and by footprint cell, with a bucket lookup `inRect` for culling). `useMiningScene` creates it (`doodadFieldRef`), `applyDoodadUpdates` in `tickHandlers.ts` feeds it each tick, and the preloader scans `initialSessionState.doodads` for pictures and sounds. Stage 3's renderer reads `world.doodadFieldRef.current` (`all()`, `inRect(x0, y0, x1, y1)`; `apply()` and `onTileChanged()` return the entries that were added/removed so sprites can be created and retired).
- Profiler: the server's performance counts include `doodads`. (The F3 client phase belongs to the renderer.)
- Tests: `MiningGameEngine.doodads.test.ts` (nothing sent while hidden, the compact form, mirrored wall, late join snapshot, engine reveal), `MiningDoodadSubsystem.test.ts`, `DoodadField.test.ts`, `applyDoodadUpdates` and preloader tests. Payload size: four small numbers per doodad; at the default cap of 400 that is under 6 KB for the whole mine, sent in pieces as it is revealed.
