# 019: Remove hard-coded item names and magic numbers

- **Status:** Done
- **Priority:** P2
- **Area:** server + shared / data-driven design
- **Source:** Mining game audit

## Problem
- Handlers find items via `name contains 'ladder'`, `subType 'DYNAMITE'`.
- Fallbacks use `'copper_ore'`, `'sol'`, `'revolver_6shooter'`.
- `spawnMob` silently clamps `moveSpeed < 2.8` to 3.2 and `jumpForce < 8` to 8.8; `miningSpeed <= 10` is multiplied by 100.
- AI config (`aggroRange 20`, `attackRange 1.25`, `canMine true`) is hard-coded instead of read from mob data.
(Violates CLAUDE.md rule on item names.)

## Proposed approach
Drive from item table/subtypes/effects and mob data; move defaults into `MINING_CONFIG`; remove silent overrides.

## Acceptance
- Admin-configured values are honoured; no item-name literals in logic.

## Open questions
(to be asked before work starts)

## Decisions
- Item roles (torch/ladder/throwable/currency/ranged) come from category data via shared helpers in `packages/shared/src/gameLogic/itemRoles.ts`, never names.
- Legacy drop fallback removed. Chests stay empty until loot is configured in the admin app.
- Mob roster and surface dummy come from the map config (`allowedMobIds`, `surfaceDummyMobId`). Mob data (moveSpeed, jumpForce, miningSpeed, aiConfig) is honoured as-is, with defaults in `MINING_CONFIG.MOB_DEFAULT_*`.

- **Unified entity combat stats (added in session 2):** mobs must mine and fight exactly like characters: Mining Speed (swings/sec, same stat unit as players, 25 = 2 swings/sec), Tool Damage (per swing to blocks), Damage (per hit to mobs/players), Pick Power, Knockback all come from the **Effects table**. Design so any future entity gets stats the same way.
  - `ObjectEffects` gets a nullable `mobId` (additive, `prisma db push`, no reset); `Mob.mobEffects`.
  - Mob `attack` and `miningSpeed` columns and `aiConfig.attackCooldownMs` are retired: data migrated into effects by a dry-run-by-default script, then the columns are dropped (needs `--accept-data-loss` on db push; ask the owner at that step, never `--force-reset`).
  - One shared swing timer for players and mobs; it drives both block damage and melee. Mobs swing at the rate from their Mining Speed effect.
  - Folded into 019 (no separate ticket).
- Bullet sprite comes from the equipped weapon's ammo item.
- Mole Person dev-DB migration: owner approved running it ("don't wipe the db"). It is superseded by the effects migration above.

## Implementation notes
- Server: data-manager helpers, handlers via `ITEM_ROLE_WHERE`, explosive default throwable, mob stats/AI from data. Tests incl. `MiningGameEngine.mobConfig.test.ts`.
- Prisma: `MiningMapConfig.surfaceDummyMobId` pushed. Admin: `MiningConfigMobs` card (roster + dummy select).
- Client: `QuickAccessContext`, `useMiningScene` use the shared role helpers. The pickaxe/any-weapon fallbacks in `equippedWeapon` were removed.
- Mob data migration: `migrate-mob-stats.ts` was written then superseded by `migrate-mob-effects.ts` (see session 2); it was never applied to the dev DB.
- Verified: server 604+13 tests pass, client 365 pass, client and server typecheck clean.

## Session 2: unified entity combat stats (done)
- **Shared:** `gameLogic/entityStats.ts`: `deriveCombatStats(...effectLists)` (Mining Speed / Damage / Tool Damage / Pick Power / Knockback from any effect list), `swingsPerSecond`, and `advanceSwing(state, dt, wantsSwing, miningSpeed)`, the one swing timer used by players and mobs. `combatStats.ts` gained generic `sumEffects`/`EffectEntry`; `CharacterModEngine` now uses `deriveCombatStats`. Removed `Mob.attack`/`miningSpeed` types, `MobAIContext.attack`, `MiningActiveMob.attack`, `MobAIConfig.attackCooldownMs`, `MOB_DEFAULT_MINING_SPEED`, `MOB_DEFAULT_ATTACK_COOLDOWN_MS`, `MOB_DIG_HIT_INTERVAL`.
- **Prisma (pushed to the dev DB):** `ObjectEffects.mobId` + `@@unique([mobId, effectId])`, `Mob.mobEffects`; dropped `Mob.attack` and `Mob.miningSpeed` (owner approved; values were migrated first). `db push --accept-data-loss` was needed only for the column drops and the new unique constraint on an all-NULL column; no `--force-reset`.
- **Server:** mobs carry `stats` (from `mobEffects`) and a swing timer. `ChaseAndMineAI` only reports "target in reach"; the subsystem swings at the Mining Speed rate. A swing digs with Tool Damage (gated by Pick Power vs the block's `requiredPickPower`, queueing one hit of feedback per swing) or hits a player with Damage plus Knockback. A mob with no Damage effect swings but deals nothing; with no Tool Damage it cannot dig (same strict rule as unarmed players). `definitionLoaders`, `/api/game/mobs`, admin mob controller (create/update/sync with `mobEffects`) and validation updated.
- **Data:** `prisma/migrate-mob-effects.ts` (dry-run default, raw-SQL read of the old columns, idempotent, tested) applied to the dev DB: Mole Person (MS 25, Dmg 6, TD 25, aiConfig tidied), Mario (50/2/25), Dawg (50/20/25). Tool Damage 25 keeps the old dig throughput exactly (miningSpeed x 2 HP/s == 25 per swing at any speed). Replaced `migrate-mob-stats.ts`. `mobs.json` + `seed.ts` updated to carry `mobEffects`.
- **Balance note:** one swing rate now drives both digging and attacking. Mole Person used to attack every 1.0 s; it now attacks at its dig rate (2 swings/s). Retune Damage/Mining Speed in the admin app if wanted (owner chose "keep dig speed and damage per hit").
- **Admin:** new shared `components/EffectsEditor` (tested), used by `MobDetail` ("Combat Effects") and `ItemDetail` (the duplicate inline editor was removed). Attack and Mining Speed number fields removed. `MobViewer` shows Damage from effects.
- **Client:** `TestMobView` ATK from effects. Bullet sprites: removed the name/id lookup; the server already sends the equipped weapon's ammo-item sprite and scale on every projectile, so `ProjectileTextureCache` loads per-projectile `spriteUrl` textures and the renderer takes a resolver (capsule placeholder while loading).
- **Tests:** shared `entityStats.test.ts`; server `mobConfig`, `mobDigging`, `health`, `stun`, `damage`, `engine` tests updated, `migrate-mob-effects.test.ts`; admin `EffectsEditor.test.tsx`, `MobDetail` tests; client `ProjectileTextureCache.test.ts`, renderer tests. Mutation-checked: removing the swing gate, the pick-power gate, or ignoring Mining Speed each fails tests.
- Verified: shared 256, server 631, client 371, admin 131 tests pass; all typechecks clean.

## Follow-ups
- The server still falls back to `/assets/sprites/items/gun_bullet_ingame.png` when a weapon has no ammo item configured (a default asset, not item-name logic).
- A mob whose Pick Power is below a block it wants to dig will keep targeting it without progress (no re-route yet); see pathfinding ticket 024.
- Server restart needed for admin effect edits to apply (definitions load at start).
- Renaming `miningProgressMs`/`damageMs` (they hold HP) is ticket 020.
