# 017: Remove single-player facade from MiningGameEngine

- **Status:** Done
- **Priority:** P2
- **Area:** server / architecture
- **Source:** Mining game audit

## Problem
`MiningGameEngine` has ~20 `primarySession` getters/setters and overloaded signatures (`handleInput(string | MiningInputState, ...)`, `handleMeleeAttacks(grid | callback, callback?)`) kept for backwards compatibility. They hide bugs and obscure the real API.

## Proposed approach
Migrate callers/tests to explicit character IDs, delete the facade and overloads.

## Acceptance
- No `primarySession` accessors on the engine; all tests green.

## Decisions
- Tests are rewritten to explicit sessions (`engine.getPlayer(id)!.x`), not a helper.
- `characterId` is a **required first argument** on every per-player engine method.
- **No special first player**: `primaryCharacterId` / `primarySession` are gone completely (no `ownerId` kept).

## Implementation notes
- Removed from `MiningGameEngine`: `primarySession`, `primaryCharacterId`, `characterId`, `playerBody`, `position`, `velocity`, `facing`, `inputs`, `temporaryBackpack`, `visionRange`, `isMining`, `miningTarget`, `miningProgressMs`, `miningTimeMs`, `miningSpeed`, `isFacingLeft`, `animationState` (about 20 getters/setters that silently returned defaults when no primary player existed). World collections (`players`, `playerCount`, `activeMobs`, `activeRocks`, `activeDynamites`, `activeProjectiles`, `droppedItems`, `activeItemBodies`) stay.
- New signatures (characterId first, required): `handleInput(id, input)`, `startMining(id, target)`, `stopMining(id)`, `placeLadder(id, target?)`, `placeTorch(id, target)`, `canPlaceLadder(id, target?)`, `canPlaceTorch(id, target)`, `setMiningSpeed(id, speed)`, `setLoadout(id, loadout)`, `setSocket(id, socket)`, `increaseVisionRange(id, amount?)`. The `string | MiningInputState` overload on `handleInput` and the `grid | callback` overload on `handleMeleeAttacks` are gone (`handleMeleeAttacks(mobs, grid | undefined, onDamage)`).
- `MiningPlayerManager` no longer takes or tracks a primary player (`removePlayer` no longer reassigns one). `MiningSessionManager.buildClientState(engine, characterId)` now requires the player (throws "not in this mining room" otherwise); its "fall back to the primary player / engine defaults" branches were deleted. Handlers and `gameEvents` updated.
- The compiler drove the migration; ~130 test lines were rewritten mechanically (all main-engine tests use `'char-1'`).
- Tests: new `MiningGameEngine.playerApi.test.ts` (15): facade gone, unknown players are harmless no-ops, calls affect only the named player (always checking the *second* joiner, so "acts on whoever joined first" bugs can't hide), reach/ladder tile measured from the named player, either player leaving doesn't disturb the other, the melee signature, and `buildClientState` describing the named player. Mutation-checked (a manager method acting on the first player fails the test); that check also exposed a weak first version of the test, which targeted the first player and so could not tell.
- Not changed: the constructor option `characterId`/`socket` that adds an initial player (creation sugar used by tests and `MiningSessionManager`), and the unrelated legacy `services/miningSession.service.ts`.
