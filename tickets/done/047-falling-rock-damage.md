# 047 - Falling rocks damage the player by impact speed

**Priority:** P2 - **Status:** Done (2026-10-12)

## Problem
`MiningRockSubsystem.updateFallingRocks` emits a flat `MINING_CONFIG.ROCK_CRUSH_DAMAGE` through a `mining_event_result` socket message every tick the rock overlaps the player. It bypasses `applyDamage`, so the player's health, `player_damaged` event, knockback and 045 numbers never happen, and the amount ignores how fast the rock is. Owner wants speed-based damage.

## Decisions (owner Q&A)
- Damage scales with the rock's speed (same style as fall damage): `damage = (rockSpeed - minSpeed) * damagePerSpeed`, `0` at or below `minSpeed`, optional max cap.
- Settings on the **Mining Config** page: `rockDamageMinSpeed`, `rockDamagePerSpeed`, `rockDamageMax` (next to the existing rock gravity/restitution fields).
- Environmental damage ignores the invulnerability window (same as 046), but a single rock must not hit the same player every tick: each rock damages a given player **at most once** per fall.
- Goes through `applyDamage` (source kind `environment`, name "Falling rock"), with a small knockback away from the rock so the player is not stuck inside it.

## Plan (new-field checklist)
1. Shared: three fields in `MiningMapConfigData`/defaults; reuse the pure damage helper from 046 (generalize to `computeSpeedDamage(speed, min, perSpeed, max)` and use it for both). Remove the now-unused `ROCK_CRUSH_DAMAGE` constant if nothing else needs it (also used by `miningSession.service.ts` lines ~198 and ~308: check those legacy paths and move them to the same rule or delete if dead).
2. Schema/validation/service/admin form as in 046 (`MiningMapConfig`, `prisma db push` + `generate`, no force-reset).
3. Server: in `updateFallingRocks`, replace the socket emit with `applyDamage` using `rock.velocity` magnitude (or vertical component; use the downward speed), track per-rock hit players (`Set<characterId>`), keep the existing hit test (distance and `totalFallenDistance` guards) but base it on the real rock/player colliders if cheap.
4. Client: nothing new beyond 045/044 reacting to `player_damaged`; remove any client handling of the old `damageTaken` event result if it is dead.
5. Tests: slow rock = no damage, faster rock = more damage (linear), cap, one hit per rock per player, two players hit separately, rock settled = no damage, invulnerability bypass, config validation + admin form. Mutation-check: remove the once-per-rock set (damage repeats) and the min-speed gate, confirm failures.

## Notes
- Do 046 first: it introduces the `environment` source, the invulnerability bypass and the shared helper.

## Implementation notes
- Shared: `rockDamageMinSpeed / PerSpeed / Max` on `MiningMapConfigData` (defaults 6, 5, 80), reusing 046's `computeSpeedDamage`. Server: columns on `MiningMapConfig` (`db push`, additive), validation, service, JSON mirror; `environmentalDamage.ts` resolves the fall and rock rules from the map config with defaults.
- `MiningRockSubsystem.crushPlayers` replaces the old flat `mining_event_result` emit (which health, knockback and the damage event never saw). It goes through `applyDamage` (source `environment`, name "Falling rock", ignores invulnerability, sideways knockback away from the rock), at most once per rock per player (`MiningRockEntity.hitPlayerIds`).
- Found while testing: rocks have no terminal velocity (~38 tiles/s after 30 tiles) and move more than a tile per tick, so the old distance check at the end of the tick tunneled through the player and could only "hit" on a later, slow bounce. The check is now swept (`distanceToSegment` from the rock's previous to current position) and uses the speed the rock had on the way down.
- Legacy: `ROCK_CRUSH_DAMAGE` is still used only by the old turn-based `miningSession.service.ts` path (nothing in the live game calls it), so the constant stays. The client never read the old `mining_event_result`/`damageTaken`.
- Admin: second rule in the `MiningConfigDamage` card with a preview of rock speeds 8/12/20/30.
- Tests: `MiningGameEngine.rockDamage.test.ts` (long fall hurts via its own event, once per fall, taller drop hurts more, cap, min speed, bypasses and does not start invulnerability, sideways shove, not hurt when beside the rock, two players hurt once each), `MiningRockSubsystem.test.ts` (segment distance), API tests, admin card tests. Mutation-checked: removing the once-per-player guard, using only the post-bounce velocity (damage collapses to ~1), and dropping the invulnerability bypass each fail tests. Server 777 / admin 168 tests pass, both typechecks clean.
