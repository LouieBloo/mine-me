# 013: Sim-time cooldowns and fixed-timestep loop

- **Status:** Done
- **Priority:** P1
- **Area:** server / architecture
- **Source:** Mining game audit

## Problem
Sim uses a fixed `dt` while cooldowns use `Date.now()` (swings, shots, melee, `lastShotTime`). `setInterval(1/30)` has no accumulator, so lag slows the game instead of catching up. Hard to test deterministically.

## Proposed approach
Add sim time (`tickCount * dt`) and convert all cooldowns; accumulator-based loop with a max catch-up; injectable clock for tests.

## Acceptance
- No `Date.now()` in simulation logic; tests advance ticks deterministically.

## Decisions
- Loop: **accumulator with catch-up, capped at 5 ticks per wake-up**; backlog beyond the cap is dropped (a hitch instead of a catch-up spiral).
- Scope: all simulation logic moves to sim time; **entity IDs and event labels may keep `Date.now()`** (they are labels, not logic).
- Tests drive time by calling `tick(dt)` / `advance(seconds)`; no injectable clock.

## Implementation notes
- Audit result: after ticket 012 (swings) the only wall-clock *logic* left was the gun fire-rate cooldown; the rest of the `Date.now()` hits are ID labels (`proj_`, `shot_`, `drop_`, `mob_`, `dynamite_`) and are intentionally unchanged.
- `MINING_CONFIG.SERVER_TICK_RATE` (30) and `MAX_CATCHUP_TICKS` (5); `MiningGameEngine.TICK_SECONDS`.
- `start()` now polls a monotonic clock (`performance.now()`) every ~16 ms and calls the new public `advance(elapsedSeconds)`, which runs fixed steps from an accumulator (partial steps are kept, invalid input ignored, stops promptly if the room ends mid-burst, warns and counts `droppedTicks` when it has to drop a backlog). Session duration (`elapsedTimeSeconds`) therefore tracks real time even with lag; before, each late `setInterval` wake-up silently lost the missed ticks and stretched sessions.
- Fire rate: `WeaponMagazine.lastShotTime` (ms) -> `lastShotAt` (sim seconds, `-Infinity` before the first shot so the first shot is never blocked at sim time 0); `shootProjectile` takes the engine's sim time.
- Tests: `MiningGameEngine.loop.test.ts` (accumulator behaviour, cap/drop, irregular wake-ups, timeout under lag, `start()`/`stop()` with fake timers incl. a simulated stall, fire rate on sim time and unaffected by the wall clock); existing ammo/projectile tests now reset `lastShotAt`. Mutation-checked: removing catch-up or the cap fails 8 / 3 tests.
- Not changed: swing/mob/hit-stun/immunity timers were already `dt`-based.
