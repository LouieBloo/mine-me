# 001: Validate client input and make the tick crash-proof

- **Status:** Done
- **Priority:** P0
- **Area:** server / mining engine
- **Source:** Mining game audit

## Problem
- `isInBounds` (`apps/server/src/services/miningMap.service.ts:499`) accepts non-integers. A client-sent `miningTarget` like `{x: 1.5, y: 3}` passes, `grid[y][x]` is `undefined`, and the tick throws.
- `MiningGameEngine.tick()` has no try/catch and there is no `uncaughtException` handler. A throw in the `setInterval` callback kills the whole Node process (all rooms).
- `MiningPlayerManager.handleInput` stores the client input object as-is (`:191`). NaN/non-numeric `aimDirection`, string booleans, etc. flow into the simulation.

## Proposed approach
- Add a validator/sanitizer for `MiningInputState` (booleans coerced, finite numbers, integer tile coords, normalized aim vector) in `packages/shared`.
- Make `isInBounds` (or a new `isValidTile`) require integers.
- Wrap each subsystem step in `tick()` with try/catch + logging so one failure can't stop the room; decide policy on repeated failures.

## Acceptance
- Malformed input never reaches the simulation; tests cover NaN, floats, wrong types, huge numbers.
- A thrown error in one subsystem is logged and does not crash the process.

## Decisions
- Tick failure: log and continue per subsystem step; after repeated consecutive failures end that room only (threshold 10).
- Invalid client input: drop silently, keep previous valid input, log at debug.
- Validators live in `packages/shared`.
- `isInBounds` becomes strict (integers only); float-position callers get fixed.

## Implementation notes
- `packages/shared/src/utils/miningInputValidation.ts`: `sanitizeMiningInput`, `sanitizeTilePosition`, `sanitizeWorldPoint` (+ tests in `packages/shared/tests`).
- `isInBounds` now requires integers.
- `MiningPlayerManager.handleInput` sanitizes; malformed payloads are dropped and the previous input kept. Interact / place ladder / place torch / throw / shoot handlers sanitize their targets (shoot/throw targets and muzzle position are validated as finite points).
- `MiningGameEngine.tick` runs each subsystem via `runStep` (try/catch + log). After 10 consecutive failing ticks the room is stopped, players get `mining_session_timeout` with a "collapsed" message (client reuses its timeout handler), and `onFatalError` cleans up the room.
- Aim vectors are now normalised server-side; one multiplayer test fixture updated to compare approximately.
- Tests: `MiningGameEngine.safety.test.ts`.
- Known gap: loot is not persisted when a room ends from a fatal error (same as timeout) — covered by 003.
