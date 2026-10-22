# 014: Prevent hit-stun lock on mobs

- **Status:** Done
- **Priority:** P2
- **Area:** server / mobs
- **Source:** Mining game audit

## Problem
Each hit resets `hitStunDurationMs` to 250 (`MiningMobSubsystem.ts:402`). Fast weapons keep mobs permanently stunned. Stunned mobs also keep stale `isMining`/attack state.

## Proposed approach
Stun resistance, hit immunity window, or capped stun; clear action state on stun; make values per-mob data.

## Acceptance
- A mob under sustained fire still acts; tests cover it.

## Decisions
- Rule: a hit stuns only if the mob **isn't already stunned and isn't in its post-stun immunity window**; extra hits during a stun don't extend it. Damage always applies.
- Numbers live as **real columns on the Mob table**: `hitStunMs` (default 250; 0 = can't be stunned) and `stunImmunityMs` (default 500). Applied with an additive `prisma db push` (no reset); existing mobs got the defaults.
- **Knockback always applies**, stunned or not; only the loss of control is limited.
- A new stun **interrupts** the mob's current action (stops digging and clears dig-feedback batching).

## Implementation notes
- Schema: `Mob.hitStunMs`, `Mob.stunImmunityMs`. Admin: both fields on the mob form (new-mob defaults 250/500), server validation (0-5000 / 0-10000), `mobs.json` seed data, shared `Mob` type. `MINING_CONFIG.MOB_HIT_STUN_MS` / `MOB_STUN_IMMUNITY_MS` are the fallbacks when a definition lacks them (invalid values are ignored).
- `MiningMobSubsystem`: per-mob `hitStunMs`, `stunImmunityMs`, `hitStunDurationMs`, `stunImmuneRemainingMs`; `canBeStunned`; the update loop starts the immunity window when a stun ends and counts it down every tick. Killing blows skip the stun and go straight to the death state. Previously every hit reset a fixed 250 ms stun, so a fast weapon kept a mob permanently stunned and the animation pinned to 'damage'.
- Tests: `MiningGameEngine.stun.test.ts` (stun length, no extension, immunity, sustained fire leaves the mob stunned only ~1/3 of the time, boss-style 0 stun, defaults/invalid values, per-mob values, knockback unaffected, dig interruption, killing blow); admin `MobDetail.test.tsx`. Mutation-checked the no-extension and immunity rules. Also tightened the earlier "tapping vs holding" test (ticket 012) so it measures a stationary target instead of a mob that can now walk back into range.
- Not done: the stun-immunity state is not shown to clients (only the 'damage' animation while stunned).
