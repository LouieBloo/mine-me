# 018: MiningWorldContext and single spawnDrop API

- **Status:** Done
- **Priority:** P2
- **Area:** server / architecture
- **Source:** Mining game audit

## Problem
Subsystem methods take 6-11 positional args including callbacks (`explodeDynamite` 10, `updateActiveMobs` 7). Subsystems reach into each other (`spawnMobDrops` mutates `dropSubsystem.droppedItemCounter/droppedItems/activeItemBodies`, duplicating `spawnBlockDrops`).

## Proposed approach
A `MiningWorldContext` (grid, rigidWorld, data, tile-update/event sink) passed to subsystems; `dropSubsystem.spawnDrop()` as the only drop-creation path.

## Acceptance
- No positional-callback wiring; one drop-spawn implementation.

## Decisions
- Scope: **all subsystems** get a shared world context at construction; methods take only domain arguments.
- **Request objects** for methods with 5+ domain arguments (`throwDynamite`).
- **One pure `rollDropTable(table, { rng, includeCurrency })`** in shared code, with an injectable random source.

## Implementation notes
- New `MiningWorld` interface (`services/mining/MiningWorld.ts`): shared state (`grid`, `rigidWorld`, `data`, `mapConfig`, `players`, `simTime`), the collaborating systems (`playerManager`, `blocks`, `drops`, `rocks`, `explosives`, `projectiles`, `mobs`, `damage`) and the few room-owned effects (`pushTileUpdate`, `revealAround`, `notifyPlayerHealth`, `queuePlayerDeath`). The engine builds one world with lazy getters (so a subsystem always sees current state even though subsystems are created before the rest of the room) and passes it to every subsystem. This replaces `DamageWorld`, `MobWorldCallbacks`, and the long positional/callback parameter lists (e.g. `explodeDynamite` had 10 parameters, 5 of them callbacks; now 1).
- Drops: `MiningDropSubsystem.spawnDrops(drops, origin)` is the **only** place dropped items are created. Block drops and mob drops both call it; the mob subsystem no longer pokes at `droppedItems` / `activeItemBodies` / `droppedItemCounter` (~45 duplicated lines gone). Block and mob tables both go through `rollDropTable` (mob tables roll Sol, block tables do not, as before).
- Block completion moved out of the engine into `MiningBlockSubsystem.completeMiningBlock` (collider, client update, optional loot, falling rocks, reveal-cache reset, stop miners). Mob attacks (damage + knockback away from the mob) now live in the mob subsystem. Melee reads mobs and the damage system from the world.
- `ThrowRequest { target, forceRatio?, itemId?, physicsConfig?, soundEffects?, explosionRadius? }`; the throw handler builds it. `shootProjectile(id, target, muzzle?)` and `reloadWeapon(id)` lost their plumbing arguments.
- Removed dead engine pass-throughs to the data manager (`getBlockConfig`, `getItemData`, ... nothing used them; `engine.dataManager` is public) and `updateDroppedItemsPhysics` / `spawnMobDrops` wrappers.
- **Bugs fixed on the way:** (1) after a dynamite blast only the *first* player's fog-of-war cache was reset (the code iterated a one-shot `Map.values()` twice); (2) the same one-shot-iterator hazard was waiting in melee (a mob list shared across swinging players) and was avoided. (3) `rollDropTable` uses `roll < chance` so a 0% entry can never drop and 100% always does (the old `<=` let a roll of exactly 0 drop a 0% item).
- Tests: `MiningWorld.test.ts` (15: subsystems running against a stand-in world with no engine - drops, falling rocks, torch placement, tile damage; one shared world for all subsystems and lazy reads; request-object throws; explosion fog reset; deterministic drops via a fixed `Math.random`), rewritten `MiningDropSubsystem.test.ts` (canonical ids, one spawn path, which drops a block gives, limit), melee tests in `MiningGameEngine.playerApi.test.ts`, shared `dropTable.test.ts` (13). Existing tests that stubbed engine facades now stub `engine.dataManager` / call `engine.blockSubsystem.completeMiningBlock`. Mutation-checked the explosion reset and the melee mob list.

## Notes / follow-ups
- Hard-coded names remain inside `legacyBlockDrops` (`copper_ore`, `sol`) and elsewhere; that is ticket 019.
- Block tables still ignore their Sol range (unchanged behaviour); worth a decision when chests get currency drops.
- The engine still has thin delegating methods the tests use (`spawnMob`, `killMob`, `getActiveMobs`, ...); they can go once tests address subsystems directly.
