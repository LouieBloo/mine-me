# 009: Server-side player health and working mob attacks

- **Status:** Done
- **Priority:** P1
- **Area:** server / combat
- **Source:** Mining game audit

## Problem
There is no player health on the server (AI context hard-codes `health: 100`). `handleMobAttackPlayer` only emits `player_damaged`, and no client handler exists, so mob attacks currently do nothing. Attacks are instant, range-only, with no line of sight.

## Proposed approach
Add health to `MiningPlayerSession`, a damage/knockback application on players, death/respawn/loss rules, HUD wiring, line-of-sight check, optional wind-up.

## Acceptance
- Mobs damage players; health is authoritative and shown on the client; death behaviour defined and tested.

## Decisions
- Health is **server-side per run**. A run **starts at the character's max health** ("I haven't really decided, but let's just do max health for now") and a mine entry shows full health in the app's health bar. Re-entering an existing run does not heal.
- Final health is **written back to the Character on every way a run ends** (extract, abandon, disconnect, timeout, collapse, death). Death leaves **1 HP**; a living player is never written below 1.
- Death: run ends, backpack lost, back to the surface with a message.
- Damage = the mob's `attack` stat (min 1), **ignoring defense for now** (comes with ticket 011).
- On a hit: knockback away from the source plus **0.5 s invulnerability**.
- UI: use the app's existing health bar (CharacterPanel, driven by `character_stat_update`); no new in-mine HUD.

## Implementation notes
- Shared: `MINING_CONFIG` `DEFAULT_PLAYER_MAX_HEALTH`, `PLAYER_HIT_INVULNERABILITY/KNOCKBACK_X/Y/SECONDS`; `MiningPlayerBody.applyKnockback` (+ `knockbackRemaining`: input and ladders are ignored briefly); `MiningPlayerDamagedEvent` / `MiningSessionEndedEvent` types.
- Server: `MiningPlayerSession` gets `health`, `maxHealth`, `invulnerableSeconds`, `isDead`. `MiningPlayerManager.damagePlayer` (ignores dead/invulnerable/invalid), `MiningGameEngine.damagePlayer` (knockback, `player_damaged` event, `onPlayerHealthChanged`, death queued and processed after the tick's steps via `mining_session_ended` + `onPlayerDeath`).
- Mob attacks now work: `MobWorldCallbacks.onAttackPlayer` replaces the old `handleMobAttackPlayer` event-only emit (which had no client listener). Attacks need a clear line (new `isSegmentBlocked` in `subsystems/miningGeometry.ts`, shared with the muzzle code); the AI context uses the player's real health instead of a hard-coded 100, so dead players are no longer targeted.
- `MiningSessionManager`: broadcasts `{health}` to the app on damage (no DB write mid-run), `persistHealth` on every run end (failures are logged and never block leaving), `handlePlayerDeath`, `cancelSession(characterId, { persistHealth })`. `createSession` gained a trailing `maxHealth` param; `handleMiningStart` passes `character.maxHealth` and pushes the starting health.
- Client: `player_damaged` / `mining_session_ended` in the socket event map; new `usePlayerDamageEvents` applies the knockback to the predicted body; `MineView` ends the run with an error notification on `mining_session_ended` (and shares one handler with the timeout).
- Tests: shared `MiningPlayerKnockback.test.ts`; server `MiningGameEngine.health.test.ts` (rules, invulnerability, knockback, death, real mob attacks, line of sight), `MiningSessionManager.health.test.ts`, `startHealth.test.ts`; client `usePlayerDamageEvents.test.ts`, MineView lifecycle tests.

## Notes / follow-ups
- Not done: attack wind-up/telegraph (ticket 023); defense reduction (011); a damage flash/number on the player.
- Rock crush still only emits the unused `mining_event_result` and does **not** damage players; routing it through `damagePlayer` is a one-line follow-up if wanted (`ROCK_CRUSH_DAMAGE` is already defined).
- Because a run starts at max health, writing health back mostly just reflects the final value; if you later decide runs should start from the character's current health, change the seed in `MiningPlayerManager.addPlayer` / `handleMiningStart` (healing items used mid-run would also need to update the session).
