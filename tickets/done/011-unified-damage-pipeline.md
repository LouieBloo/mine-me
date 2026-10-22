# 011: Unified damage pipeline (applyDamage / damageTile)

- **Status:** Done
- **Priority:** P1
- **Area:** server / architecture
- **Source:** Mining game audit

## Problem
Tile damage goes through 4 separate paths (BlockSubsystem swings, an inline lambda in `MiningGameEngine.tick` for projectiles, MobSubsystem mining, ExplosiveSubsystem). Mob damage is `damageMob(id, number)` with no attacker, type, knockback, defense, crit, or kill credit. Explosions hard-code 50 damage with no falloff.

## Proposed approach
- `applyDamage(target, { amount, source, type, knockback })` for entities, `damageTile(x, y, amount, source)` for tiles.
- Every weapon/explosion/mob calls these; dynamite damage comes from item effects.

## Acceptance
- Single code path per target type; existing behaviour preserved by tests; new weapons need no new damage code.

## Decisions
- API: `applyDamage(target, DamageEvent)` for mobs/players and `damageTile(x, y, DamageEvent, miners?)` for blocks; all sources build a `DamageEvent` and use them.
- Every event carries a **damage type** tag (`melee | ranged | explosive | mining`); not used for resistances yet.
- Scope: **migrate all current paths with unchanged numbers; no new mechanics.** Defense, crits, falloff, pickaxe power stay in 012/025.
- **Kill credit: not yet** (the event carries the source so it can be added without touching callers).

## Implementation notes
- Shared `gameLogic/damage.ts`: `DamageEvent`, `DamageSource` (kind, id, name, ownerId, itemId, position), `DamageTarget`, `DamageResult`, `TileDamageResult`, `isValidDamageAmount`, `knockbackAway`. New `MINING_CONFIG.EXPLOSION_MOB_DAMAGE` (the old hard-coded 50, still flat until 025).
- Server `MiningDamageSystem` (owned by the engine, exposed as `engine.applyDamage` / `engine.damageTile`) is the only place hits are applied: validation, a `modifyDamage` hook (identity today; where defense goes), mob damage + knockback (movable mobs only), player damage (immunity, knockback, `player_damaged`, death queue), tile damage (crack stages, breaking, loot rules). It talks to the world through a small `DamageWorld` interface instead of callbacks.
- Sources migrated: melee (`type melee`, credited to the player, with knockback), bullets vs mobs and vs blocks (`ranged`, `ownerId` + weapon `itemId`), dynamite vs mobs (`explosive`, thrower recorded on the entity), player pickaxe swings (`mining`, cooperative miners hit together, first miner credited), mobs digging (`mining`, source mob, no loot), mob attacks on players (`melee`, source mob, knockback away). The four duplicated tile-damage code paths and the inline projectile lambda in `tick()` are gone.
- Removed the engine's `damageMob` / `damagePlayer` (and the mob subsystem's `onPendingTile`/`onCompleteBlock`, `handleMobAttackPlayer` earlier); tests use `testHelpers.hitMob / hitPlayer`.
- Tiny behaviour changes (all from unifying): a bullet that breaks a block now stops every player mining *that* block (it used to stop the shooter, even if mining elsewhere); a bullet that doesn't change a block's crack stage no longer re-sends an unchanged tile update; hit-event emission is unchanged (players and mobs emit block hits, bullets still don't).
- Not migrated: dynamite *tile* destruction (it still clears blocks directly and ignores hardness) — ticket 025.
- Tests: `MiningDamageSystem.test.ts` (30: validation, results, knockback rules, immunity, tile staging/breaking/loot, and one test per source asserting the exact `DamageEvent`); mutation-checked the loot and knockback rules. Existing engine/health/mob tests updated to the new API with all numbers unchanged.
