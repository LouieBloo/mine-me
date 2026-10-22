# 012: Separate tool stats from weapon stats

- **Status:** Done
- **Priority:** P1
- **Area:** shared / game design
- **Source:** Mining game audit

## Problem
`miningDamage`/`miningSpeed` drive both block and mob damage. There is no pickaxe power vs block hardness, no knockback stat, and bullets ignore block hardness. Block swings (`swingTimer`) and melee hits (`lastAttackTimeMs`) run on separate timers and desync.

## Proposed approach
Define item stats: pick power, tool damage, weapon damage, knockback, use time. One swing timer per player driving both block and melee hits.

## Acceptance
- Stats defined in item table/effects (no hard-coded names); swing drives both outcomes consistently.

## Decisions
- Separate stats: **toolDamage** (blocks), **weaponDamage** (mobs/bullets), **pickPower**, **knockback**, and the existing **Mining Speed** as the single swing rate. The new ones are real **Effects** (reusable on any item), not hard-coded.
- Stats come from item **Effects** (existing Effect/ObjectEffects tables). Schema changes via `prisma db push` (additive, no reset): 3 flag columns on `Effect`, `requiredPickPower` on `MiningBlock`. Applied to the dev DB.
- Tool damage is **strict**: only from the Tool Damage effect (no fallback to Damage). The seed pickaxe was re-tagged.
- Pick power is a **hard gate**: a tool below a block's `requiredPickPower` can't damage it. Items default to 0 and blocks to 0 required, so nothing changes until content sets it. A throttled "Your tool isn't strong enough to break X" toast is shown.
- **One swing hits everything in reach**: a single swing timer fires block damage (to the block under the cursor) and melee damage (to mobs in the hit box) together.
- Knockback effect value = tenths of tiles/s sideways (45 = 4.5); no effect = today's default 4.5 / -3.2 push.

## Implementation notes
- Shared: `gameLogic/combatStats.ts` (`sumItemEffect`, `getItemToolDamage/PickPower/KnockbackEffect`, `knockbackImpulse`, `canBreakBlock`, `MiningCombatStats`), `CharacterModEngine` now returns `toolDamage / weaponDamage / pickPower / knockback / miningSpeed` (`miningDamage` is gone), `Effect` type gained the three flags, `MiningNoticeEvent`, `MINING_CONFIG.TOOL_NOTICE_COOLDOWN_SECONDS`.
- Server: sessions carry the four stats (`miningDamage` removed); `buildMiningLoadout` computes them for start/equip/unequip; `MiningPlayerManager.advanceSwings` is the single swing timer (carry-over capped at one tick; keeps counting when the key is up so tapping can't beat holding; uses sim `dt`, not wall-clock); `MiningBlockSubsystem` and `handleMeleeAttacks` consume `swungThisTick`; pick-power gate at `startMining` and again at swing time (tool swapped mid-dig); `MiningDataManager.getBlockRequiredPickPower`; `inventory.mapItem` now passes all effect flags (it previously dropped `explodes` too); `mining_notice` event.
- Admin: effect kinds are one data-driven list (`pages/Effects/effectKinds.ts`) used by the effect editor, effects table and item effect picker/badges; the block editor has "Required Pick Power"; effect controller/validation use a single flag list.
- Seed/content: `effects.json` (+Tool Damage, Pick Power, Knockback), Basic Pickaxe tagged with Tool Damage 25, `blocks.json` `requiredPickPower: 0`, `seed.ts` updated.
- Client: `mining_notice` toast in `MineView`.
- Data migration for an existing DB: `apps/server/prisma/migrate-combat-stats.ts` (idempotent, dry-run by default, `--apply` to write). It only adds the 3 effects and gives each mining tool (Mining Speed + Damage) Tool Damage = its old Damage. Do NOT use `prisma db seed` for this: the seed rewrites every item from the JSON and would overwrite admin edits.
- Tests: shared `combatStats.test.ts` + updated mod/speed tests; server `MiningGameEngine.toolStats.test.ts` (shared swing, tapping, tool vs weapon, cooperative mining, pick-power gate + notice throttle + mid-dig swap, knockback), loadout and `mapItem` tests, `migrateCombatStats.test.ts`; client MineView toast test; admin `effectKinds.test.ts` and BlockDetail tests. Mutation-checked the pick-power gate and the shared-swing rule.

## Notes / follow-ups
- Until the data migration runs against a DB, a mining tool there has Damage but no Tool Damage, so it can't mine (the strict rule).
- Bullets still damage blocks regardless of pick power; making ranged damage respect block hardness is a separate design decision.
- The Mining Speed effect is now the swing rate for melee as well as mining (weapons with no Mining Speed swing at the 25 baseline).
- Melee used to be cooldown-limited by wall-clock time with an 80 ms floor; it now follows the shared swing rate with no floor.

## Applied to the dev database
`migrate-combat-stats.ts --apply` was run against the local dev DB (with the owner's approval): created the Tool Damage / Pick Power / Knockback effects and gave the Basic Pickaxe Tool Damage 25. Re-running reports "Nothing to do". Verified: the pickaxe now has Tool Damage 25, Mining Speed 25, Damage 25.
