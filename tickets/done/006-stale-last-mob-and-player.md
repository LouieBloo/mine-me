# 006: Fix empty mobs/otherPlayers not clearing on client

- **Status:** Done
- **Priority:** P1
- **Area:** server + client sync
- **Source:** Mining game audit

## Problem
Server sends `mobs: undefined` / `otherPlayers: undefined` when empty (`MiningGameEngine.ts:883,887`), but the client does `if (payload.mobs)` / `if (payload.otherPlayers)` (`useMiningStateSync.ts:212-219`). The "empty list removes everything" branch in `MiningMobRenderer.updateMobs` is unreachable, so the last mob (or last remote player) stays on screen as a ghost.

## Proposed approach
Send empty arrays (or an explicit flag), and/or have the client treat `undefined` as "none". Add tests on both sides.

## Acceptance
- Killing the last mob removes its sprite; last remote player leaving removes theirs.

## Decisions
- Server always sends `mobs` and `otherPlayers` arrays (empty = none), in both the 30 Hz tick and the session snapshot.
- Audit all optional tick fields for stale-state cases; fix any found.
- Verify the snapshot path replaces stale entities.

## Implementation notes
- Server: `broadcastStateTick` and `buildClientState` no longer collapse empty lists to `undefined`. The multiplayer test that asserted `otherPlayers: undefined` after a player left (it encoded the bug) now expects `[]`.
- Client: new `systems/applyTickEntityLists.ts` (a present array, even empty, is authoritative; a missing field leaves entities untouched) used by `useMiningStateSync` instead of inline `if (payload.mobs)` checks; extracted so it can be unit tested.
- Tests: `applyTickEntityLists.test.ts`, MobRenderer "last mob removed / fresh list replaces stale", server tests for empty arrays and "last mob dies -> `mobs: []`".
- Audit of the other optional fields: `fallingRocks`, `activeDynamites`, `activeProjectiles` are already defaulted to `[]` on the client; `droppedItems` and `temporaryBackpack` are sent as arrays (including empty) whenever dirty, and the client checks truthiness of the array, so an empty array is applied; `explosions` / `gunshots` / `blockHits` are one-shot events consumed per tick. No other stale-state bugs found.
- Snapshot path: the scene (and its renderers) are created fresh from the snapshot on mount, so no stale entries can survive a rejoin; renderer-level test added to lock in replace semantics.
- Observed but not changed: `weaponAmmo` is never cleared on the client when the weapon is unequipped (HUD may show stale ammo). Candidate for ticket 008.
