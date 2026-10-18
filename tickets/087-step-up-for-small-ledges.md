# 087 - Auto step-up over 1-cell ledges (players and mobs)

**Priority:** P1 - **Status:** Done (2026-10-17) - **Part of:** small blocks epic (085-090) - **Depends on:** 085 - **Phase 1: playable feel test (085-087)**

## Problem
With cells a third of the original size, a 1-cell bump is a small step for a character about 3 cells tall. The finer caves will be full of them. Without step-up, the player and mobs stop dead on every bump, which is the main thing that makes small-block games feel bad.

## Design
- When horizontal movement is blocked by a wall exactly one cell high, and there is room above for the collider, lift the body onto it in the same step instead of stopping. This only happens while grounded, never in the air. The vertical move is drawn smoothly on the client (no snap).
- It lives in the shared physics (`MiningPhysicsBody`), so server, client prediction and mobs all behave the same. Prediction and the server must agree (a replay test).
- `MAX_STEP_UP_TILES: 1` in `MINING_CONFIG`.
- It must not let a body climb a wall two cells high by repeatedly stepping, or pass through a gap narrower than the collider.

## Decisions (2026-10-17)
- Applies to players and mobs. The mob pathfinder (090) treats a 1-cell step as a walk.

## Tests
- Walking into a 1-cell step lifts the body onto it. A 2-cell wall still stops it (so at 3x a 2-block bump needs a jump). A 1-cell step under a ceiling too low for the collider does not lift.
- Not in the air: a body jumping into a 1-cell ledge from below is not lifted.
- Server and client prediction reach the same position for the same input sequence.
- Mutation check: set `MAX_STEP_UP_TILES` to 0, the step test fails.

## Implementation notes (2026-10-17)
- In `MiningPhysicsBody.step` (shared, so server, client prediction and mobs agree): when horizontal movement is blocked, a grounded body that is not rising tries `tryStepUp`: lift by `MAX_STEP_UP_TILES` (1), and only if the lifted body collides with nothing and has solid ground under its feet. Otherwise the old wall snap happens.
- **Smooth drawing:** `body.stepUpLift` records the lift of the last `update`; `PlayerPredictor.stepOnce` adds it to `renderOffset` (which already decays) and the look-ahead leaves it out, so the drawn player glides up instead of popping. Test: the drawn height never jumps by half a tile while the body moves up a whole one, and a server-side body ends up exactly where the client body does.
- Existing wall tests (`MiningPhysicsGroundStability`) now use walls two cells high; a one-cell wall is a step.
- Tests: `packages/shared/tests/MiningStepUp.test.ts` (8). Mutation check: with `MAX_STEP_UP_TILES: 0` the ledge, staircase and mob tests fail.
- Not done: nothing stops a mob that is mid-AI-jump from being lifted differently; the mob pathfinder does not know about steps yet (090).

## 3x (decision 2026-10-17)
The step height stays **1 block** at 3x (the Terraria rule: a 3-tall character walks up 1-block ledges and jumps the rest). The jump is 3.9 blocks high, so 2- and 3-block ledges are one jump. If it feels too fiddly, raise `MAX_STEP_UP_TILES` to 2 (one number; the tests read it).
