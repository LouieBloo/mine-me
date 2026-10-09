# 007: Route mob block mining through shared completion path

- **Status:** Done
- **Priority:** P1
- **Area:** server / mobs
- **Source:** Mining game audit

## Problem
`MiningMobSubsystem.handleMobMining` (`:302`) duplicates block-completion logic. It skips `checkAndTriggerFallingRocks` and the player reveal-cache invalidation, so mob-dug tunnels don't drop rocks. It also uses continuous damage (`miningSpeed*2*dt`) while players use discrete swings, and mutates the tile in place while players replace it.

## Proposed approach
Use one `damageTile` / `completeMiningBlock` path for all sources (see 011). Decide mob mining damage model.

## Acceptance
- Mob-mined blocks drop items, trigger falling rocks, and update clients identically to player-mined blocks.

## Decisions
- Mob digging keeps the **continuous** damage model for now (per-swing mob digging can come with 011/012).
- Mob dig feedback (block sounds/particles) is sent **only to players near the block** ("in view or close"); user noted this "might need more refining".
- Mobs **drop nothing** when they break blocks (previously they did) so they can't farm ore.
- The engine's `completeMiningBlock` is the single completion path for players, projectiles and mobs.

## Implementation notes
- `MiningMobSubsystem.updateActiveMobs` / `handleMobMining` now take a `MobWorldCallbacks` object (`onPendingTile`, `onCompleteBlock`, `onBlockHit`) instead of rigidWorld/dropSubsystem/dataManager plumbing. Engine builds it via `mobWorldCallbacks()`; the public facade `engine.handleMobMining(mob, target, dt)` is unchanged.
- `completeMiningBlock(target, miners?, { dropItems })`: mob breaks now remove the collider, notify clients, trigger falling rocks, reset reveal caches and stop any player mining that tile; `dropItems: false` for mobs.
- Dig feedback: batched per mob at `MINING_CONFIG.MOB_DIG_HIT_INTERVAL` (0.4 s), flushed on break, reset when the target changes or digging stops. Events carry `source: 'mob'` (new optional field on `MiningBlockHitEvent`). `broadcastStateTick` filters mob hits per recipient using `MINING_CONFIG.BLOCK_HIT_HEARING_RANGE` (14 tiles, Euclidean from the block centre). Player hits are still sent to everyone. No client change was needed (client already plays block sounds/particles from `blockHits`).
- **Extra bug fixed:** `MiningBlockSubsystem.completeMiningBlock` received `players.values()` (a one-shot iterator) and exhausted it in the reveal-reset loop, so the "stop everyone mining this tile" fallback always saw nobody. Now materialised once.
- Tests: `MiningGameEngine.mobDigging.test.ts` (falling rocks, no drops, player stop, collider/tile update, hit batching/flush/reset, per-recipient range filtering).
- Follow-ups: range is a flat radius, not true line-of-sight / on-screen test; refine later (e.g. use client viewport size or visibility of the tile).
