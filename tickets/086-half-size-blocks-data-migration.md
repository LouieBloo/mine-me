# 086 - Small blocks (3x): migrate game data (DB rows and dev seed)

**Priority:** P1 - **Status:** Done: the dev DB is at 3x (applied 2026-10-17); seed JSON and tests still to convert (see 085) - **Part of:** small blocks epic (085-090) - **Depends on:** ships with 085 - **Phase 1: playable feel test (085-087)**

## Problem
A lot of world-scale numbers live in Postgres rows (mobs, items, effects, fluids, gases, map config), not in code. They have to scale under the same rule as 085 (x3), or mobs, lights, guns and generation will be a third of their size in the new world.

## Design
One dry-run-by-default script, `apps/server/prisma/migrate-half-size-blocks.ts`, following `migrate-sound-library.ts`. It prints every change (row, field, old -> new) and writes only with `--apply`, which the owner is asked about first. It marks each row as done so that running it twice does nothing: a second run finds nothing to change. The same transform updates `packages/shared/src/data/*.json` (the dev seed / test mirror) so tests and the DB agree.

**Fields that multiply by the scale (x3):**
- `MiningMapConfig`: `gridWidth`, `gridHeight`, `cavernMinDepth`, `tunnelMinLength`, `tunnelMaxLength`, `tunnelWidth`, `tunnelMinDepth`, `silveriumMinDepth`, `mobSpawnMinDepth`, `gravity`, `dynamiteThrowPower`, `fallDamageMinSpeed`, `rockDamageMinSpeed`, `heatRadius`.
- `Mob`: `moveSpeed`, `jumpForce`. `aiConfig`: `aggroRange`, `attackRange`, `mineRange`, `maxJumpTiles`, `colliderWidth`, `colliderHeight`, plus any other tile-unit key found in `MobAiConfig` (check the type, list them here).
- `Item`: `physicsConfig.throwPower`, `lightConfig.radius`, `heldLightConfig.radius`, `projectileConfig.projectileSpeed`.
- `ObjectEffects` values for the **Explosion** effect (radius in tiles) and the **Knockback** effect (tenths of tiles/s). Match effects by their flags (`explodes`, `knockbackModifier`), never by name.
- `Fluid` and `Gas`: `generation.minSize/maxSize/minDepth/maxDepth`, `light.radius`, `flammability.flameLight.radius`, `flammability.explosion.blastRadius` and `frontSpeed`, plus any tile-unit field in `contact`.
- `MiningBlock`: `flammability.flameLight.radius`.

**Fields that divide by the scale (/3):** `MiningMapConfig.fallDamagePerSpeed` and `rockDamagePerSpeed` (damage per tile/s, so the same impact does the same damage).

**Fields that stay:** percentages and chances (`cavernDensity`, ore and rock percentages, `oreClusterChance`, `ignitionChance`, `spreadChance`), counts (`tunnelCount`, `chestCount`, `mobSpawnCount`), all times, damage and health numbers, pixel values (item `physicsConfig.collider*`, hold, muzzle and held-particle offsets, all `ParticleEffect` configs), `inGameScale`, and fluid `flowRate`/`minLevel`/`flowThreshold` (tuned by eye in 088).

**Admin and schema:**
- Prisma `@default`s for the doubled `MiningMapConfig` and `Mob` fields change to the 3x values (`npx prisma db push`, then `npx prisma generate`; no `--force-reset`).
- Admin field labels that give a unit ("tiles", "tiles/s") stay correct. Check that the defaults and slider ranges in the Mine Generator, Mob, Item light and Fluid/Gas pages allow the 3x values (e.g. a light radius slider capped at 5 must go to 10).

## Decisions (2026-10-17)
- Drops, block health and tool stats are left alone (see 085).
- Never `prisma db seed` the dev DB. The script plus `--apply` (after asking) is the only way data changes.

## Tests
- Script test (like `migrate-mob-effects.test.ts`): a sample row of each table comes out with the listed fields doubled or halved and everything else untouched. A second run changes nothing. A dry run writes nothing.
- The seed JSON and a migrated DB row give the same values.
- Mutation check: remove `heatRadius` from the list, the test fails.

## Notes for the implementer
- Json fields: change only the keys that are present, and keep `null` as `null`.
- Run the dry run and paste the summary (counts per table) into this ticket before asking to apply.

## Implementation notes (2026-10-17)
- **Script:** `apps/server/prisma/migrate-half-size-blocks.ts` (dry run by default, `--apply` writes in one transaction). Planners are pure (`planMapConfig`, `planMob`, `planItem`, `planFluid`, `planGas`, `planBlock`, `planObjectEffect`) and tested in `migrate-half-size-blocks.test.ts` (18 tests, incl. a mutation check on the field lists).
- **Idempotency:** a new generic ledger table `DataMigration { key, appliedAt, summary }` (Prisma; added with `db push`, no data touched). The script refuses to run once `half-size-blocks-2x` is in it. (A per-row marker was not possible: most of the changed fields are plain columns.)
- **Seed files:** `packages/shared/src/data/{mining_map_config,mobs,items,fluids,gases,blocks}.json` were converted with the same planners (`migrateSeedRows`) and are already in half-size blocks. Converting them again would double them again, so there is no command for it.
- **Prisma defaults** changed to the new values for `MiningMapConfig` (grid 90x90, depths, lengths, tunnel width 2, gravity 56, throw power 28, fall/rock speeds, damage per speed, heat radius 5) and `Mob` (`moveSpeed` 6, `jumpForce` 13).
- **Server validation** limits in `admin.validation.ts` doubled to fit the new values (cavern/tunnel depths, tunnel lengths and width, silverium and mob depth, gravity, throw power, fall/rock speed, heat radius).
- **Admin:** presets, cavern/tunnel/mob/resource ranges, the tunnel width options (1-4), the damage card's sample drops and rock speeds, the item light radius slider (and its px readout, which used a literal 64), the dynamite throw power slider.
- **Dry run against the dev DB (2026-10-17, nothing written):** MiningMapConfig 1, Mob 4, Item 7, Fluid 3, Gas 1, ObjectEffects 1. The one map config ("Default", active) goes from 45x45 to 90x90 (its fall minimum speed 16 -> 32, rock 6 -> 12). Full list: `npx tsx prisma/migrate-half-size-blocks.ts`.
- **Until it is applied** the dev DB still says gridWidth 45, so a mine is generated 45x45 with the exit at x = 44 (the edge) and mobs/lights/guns at the old scale. Apply it before playing.

## 3x (decision 2026-10-17)
The script is now scale-aware: `runMigration` reads the scale from the `DataMigration` ledger (empty = the original game, 1), scales every field by `target / current`, and stores the new scale (`block-scale-3x`; the first 2x run used `half-size-blocks-2x`). The target is `BLOCK_SCALE` from shared, or `--scale=N`; `--scale=1` puts the data back to the original game. Whole-number columns are rounded. The dev database had never been migrated to 2x, so it went from 1x straight to 3x (1 map config 45 -> 135, 4 mobs, 7 items, 3 fluids, 1 gas, 1 effect value). The old rows are in `apps/server/prisma/backup-before-block-scale-spike.json`.
- Tests for the script still pass a factor of 2 (the planners' default). Add cases for the ledger (`scaleFromLedger`, 1 -> 3, 3 -> 3 does nothing, 3 -> 1) and for 3x results, and move the `*.test.ts` expectations to read the scale.
- The seed JSON is still at 2x; convert it (factor 1.5) with `migrateSeedRows`.
- Admin ranges, presets and the server's validation limits already scale with `BLOCK_SCALE`.
