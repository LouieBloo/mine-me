# 056 - Flammability fields and ignition sources

**Priority:** P1 - **Status:** Done (2026-10-13), needs the data script `--apply` - **Depends on:** 051

## Decisions
- One shared **Flammability** shape on fluids AND blocks: `ignitionChance`, `burnDuration`, `spreadChance`, `heat`, `burnsInto` (what remains, e.g. nothing or ash), `flameEffect`. Grass/dead wood later are just data.
- **Ignition sources** are a data flag, not a hard-coded list: an "emits sparks / ignites" field (with strength) on items, projectiles, explosives, particle effects and fire itself. Dynamite, flame gear, pickaxe sparks if configured, and fire all qualify.
- Oil is the only flammable material for now.

## Tests
A flag-less source never ignites oil; a flagged source can; chance 0 never, chance 1 always; blocks and fluids share the same code path.

## Decisions (made on the owner's instruction to keep going; flag if wrong)
- **Ignition source = an `Ignites` effect** on the item (the Effects table, like `explodes`): a new boolean `Effect.ignites`, and the effect's value is the **strength in percent** (100 = the material's own ignition chance; 50 half as likely; 200 twice). Several Ignites effects add up. Mobs can get it the same way later.
- **What counts as a spark event:** every hit the damage pipeline applies whose source item has the effect (tool swings on a block, melee on a mob or player, bullets, and any later source), plus explosions of an item that has it. A hit sparks at the point hit (block centre, or where the target stands) with a reach of about one tile; an explosion sparks across its whole radius. No item or material is named in code.
- **Each flammable cell in reach rolls once:** chance = the material's `ignitionChance` x strength (capped at 1). Cells that catch are queued for the fire simulation (057), de-duplicated.
- **What is flammable today:** a cell holding a fluid whose `flammability` is set. Blocks join in 059 (`flammabilityAt` is the one place to extend).
- Melee and mining hits now carry the equipped weapon's item id (they did not before), which is what lets a pick or sword ignite.
- Projectile ignition uses the **weapon's** item (as the hit event already did). Ignition by the ammo item (incendiary rounds) is a later option.

## Implementation notes
- **Schema/data:** `Effect.ignites` (additive `db push`, applied), shared `Effect.ignites`, effect controller/validation/seed/inventory mapping, admin `EFFECT_KINDS` ("Ignites"). `prisma/add-ignition-effect.ts` creates the "Ignites" effect and attaches it (strength 100) to **Dynamite** and **Flame Pickaxe** if they lack it (dry run by default, idempotent, never overwrites). **Not applied: needs `--apply`.**
- **Server:** `ignition.ts` (`getIgnitionStrength`, `ignitionChance`), `MiningIgnitionSubsystem` (`emit`, `fromHit`, `fromExplosion`, `flammabilityAt`, `takeIgnited`; takes an injected random so tests control the dice), `MiningWorld.ignition`. Hooks: `MiningDamageSystem.damageTile` / `applyDamage` and the dynamite explosion.
- **Tests:** helpers (9), subsystem (15), engine scenarios (7: mining, melee, explosion, hit on a player, weak strength), the stand-in world test, the data script (5). Mutation-checked: dropping any of the four hooks (tile strike, hit on a body, explosion, weapon id on mining events, weapon id on melee) fails a test.
- The ignited queue is not consumed yet (057 does that); it is capped by the number of cells, so it cannot grow without bound.
