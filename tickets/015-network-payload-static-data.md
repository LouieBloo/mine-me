# 015: Stop re-sending static entity data every tick

- **Status:** Done
- **Priority:** P2
- **Area:** server + client / networking
- **Source:** Mining game audit

## Problem
Every 30 Hz tick re-sends: mob `animations`/`spriteUrl`/collider sizes, dynamite `physicsConfig`/`soundEffects`, projectile `spriteUrl`, remote player `gearLayers`. The whole `droppedItems` list is re-sent whenever any item moves.

## Proposed approach
Spawn events (or a definition cache) carrying static data once; per-tick payload contains only dynamic fields. Consider deltas for dropped items.

## Acceptance
- Measured tick payload size drops; clients still render correctly on join/reconnect.

## Decisions
- Mechanism: **spawn/description sent once per client, ticks carry only dynamic fields**. The join snapshot (already behind the loading screen) carries everything alive; later arrivals are described in the tick they first appear in.
- Scope: mobs, projectiles, dynamites and remote players. (Dropped items and falling rocks are ticket 016.)
- Verification: a payload-size test with a budget so static data can't creep back in.

## Implementation notes
- Shared: `MiningMobDynamic`, `MiningRemotePlayerDynamic`, `MiningProjectileDynamic`, `MiningDynamiteDynamic`, `MiningSpawnedEntities`; `MiningStateTickPayload.spawned` and the entity arrays are now the dynamic types.
- Server: new `MiningEntitySync.ts` builds dynamic payloads and, per session, `collectSpawned` works out which descriptions are still unknown to that client (tracked in `session.known`), records them as sent, and forgets entities that left. The description rides in the **same packet** as the tick that first needs it, so ordering is guaranteed. A joining or re-entering client starts with an empty `known` (so it is described everything again); a player's description is re-sent when their gear changes (`gearVersion`). `toActiveMob` is the single description builder used by both ticks and the join snapshot (which also reuses `dynamiteDefinition` / `toRemotePlayer`).
- Client: `EntityDefinitionCache` merges stored descriptions with each tick's dynamic fields and forgets entities that are gone. It stores only the *static* part of a description, so a field a tick omits (JSON drops `undefined`, e.g. a mob that stopped mining) can never inherit a stale value. Seeded from the join snapshot; wired into `useMiningStateSync`. An entity with no description is skipped (warned once) until it is described, instead of crashing.
- Side fix: `engine.spawnMob`'s parameter type is now the subsystem's real type (it used to silently drop `spriteUrl` / collider fields).
- Measured (20 Mole Persons, real animation manifests): per-tick mob data **35,435 B -> 3,695 B (-90%)**; a whole steady-state tick is ~3.8 KB; the one-off description tick is ~41 KB. At 30 Hz that is ~1.06 MB/s -> ~0.11 MB/s for mobs per client.
- Tests: server `MiningEntitySync.test.ts` (17: description once / late spawn / removal / per-client bookkeeping / reconnect / gear change / bullets / dynamites / join snapshot / size budget / `collectSpawned`), client `EntityDefinitionCache.test.ts`; existing tick-payload assertions moved to the `spawned` block. Mutation-checked: not recording sends and not resetting on reconnect fail 8 and 1 tests.

## Notes / follow-ups
- Not done: the remaining per-tick weight is mostly float digits (`5.123456789012345`); rounding positions to ~3 decimals would roughly halve it again. The player's own position/velocity and dropped items are unchanged here (ticket 016 covers drops).
- No resync request exists: if a description were ever missed, that entity stays invisible until it is described again (reconnecting fixes it). With socket.io's ordered, reliable delivery this should not happen.
- **Tooling note:** the client's and admin's root `tsconfig.json` has `"files": []`, so `tsc -p .` checks nothing there; use `tsc --noEmit -p tsconfig.app.json`. Earlier client edits (tickets 006-014) were re-checked this way and are clean (two small type errors from tickets 009/015 fixed).
