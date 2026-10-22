# 046 - Fall damage (players only), configurable in admin

**Priority:** P2 - **Status:** Done (2026-10-12)

## Problem
There is no fall damage. Owner wants characters (not mobs, for now) to take damage when landing hard, tunable in the admin.

## Decisions (owner Q&A)
- Measured by **impact speed** (vertical velocity on the tick the body lands), the same unit as falling rocks (047).
- Linear with a minimum: `damage = (impactSpeed - minSpeed) * damagePerSpeed`, `0` at or below `minSpeed`, optionally capped by a max.
- Settings live on the **Mining Config** page (existing `MiningMapConfig`, DB-backed): new fields `fallDamageMinSpeed`, `fallDamagePerSpeed`, `fallDamageMax`. Defaults chosen so normal jumps and 1-2 tile drops do nothing.
- Players only. The code should take the target kind into account so mobs can be enabled later without a rewrite.
- **Environmental damage ignores the post-hit invulnerability window** (always applies). [Assumption: it also does not start a new window, so it cannot be used to shield from a mob hit. Say so if you want it to.]
- Goes through the single pipeline: build a `DamageEvent` (source kind `environment`, name "Fall") and call `applyDamage`, so the 045 floating number and the 044 hurt/land sounds work for free.

## Plan (new-field checklist)
1. Shared: add the three fields to `MiningMapConfigData` and `DEFAULT_MINING_MAP_CONFIG`; add a pure `computeFallDamage(impactSpeed, config)` in shared (testable); add an `environment` damage source kind and an invulnerability-bypass flag on `DamageEvent` (`ignoreInvulnerability`), honored in `damagePlayer`. `npx tsc` in shared.
2. Schema: columns on `MiningMapConfig` with defaults; `prisma db push` then `generate` (no force-reset). Validation (`admin.validation.ts`, non-negative numbers), service mapping (`miningConfig.service.ts`), JSON mirror if one exists.
3. Server: detect landing (airborne -> grounded with downward velocity before the collision resolves) in the player step; emit the damage via `applyDamage` for players only. Must not fire while on a ladder, in knockback-only motion upward, or on spawn/respawn.
4. Client prediction: landing detection is server-side only, but `PlayerPredictor` must not desync (health is not predicted, so no change expected; verify).
5. Admin: three inputs on the Mining Config page with labels/help text, error handling, spinner.
6. Tests: `computeFallDamage` (below min = 0, linear, cap), server landing integration (drop from height hurts, short hop does not, ladder/respawn do not, mobs unaffected), invulnerability bypass, config validation and admin form. Mutation-check: change the comparison or remove the bypass, confirm a test fails.

## Notes
- Add the new fields to the shared `deriveCombatStats` family only if they become gear-modifiable later (not now).

## Implementation notes
- Shared: `computeSpeedDamage(speed, { minSpeed, perSpeed, max })` (generic, reused by 047), `DamageEvent.ignoreInvulnerability`, `DamageType` gains `'environmental'`, three `MiningMapConfigData` fields with defaults (min 11, 6 per tile/s, cap 80; a jump lands at ~8.5 and a 2-tile drop at ~10.6). `MiningPhysicsBody.onGroundHit(impactSpeed)` now passes the speed before it is zeroed; `MiningPlayerBody.lastImpactSpeed` keeps the hardest landing of the last update (0 if none). Ladders cap speed at climb speed, so they never trigger it.
- Server: `MiningPlayerManager.applyFallDamage` runs right after each player's physics step and sends `applyDamage` (source `environment`, name "Fall", `ignoreInvulnerability`). `damagePlayer` honors the flag: the hit always lands and does not start a new grace window. Mobs are untouched (only the player step calls it). Columns added to `MiningMapConfig` via `prisma db push` (additive, defaults); validation, service load/save and the JSON mirror updated.
- Admin: new `MiningConfigDamage` card on the Mining Config page (rules are data, so 047 adds its rock rule as another definition) with a live preview of 2/4/6/10-tile drops.
- Tests: shared `damage.test.ts` and `MiningPlayerBody.impact.test.ts`; server `MiningGameEngine.fallDamage.test.ts` (long fall, short drop, jump, scaling, custom config + cap, death, invulnerability bypass without starting a window, ladder) and admin.miningConfig API tests (save + validation); admin `MiningConfigDamage.test.tsx`. Mutation-checked: dropping the bypass, keeping the window, and breaking the min-speed gate each fail tests.
- Client prediction needs no change (health is not predicted; landing is judged server-side).
