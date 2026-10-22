# 055 - Fluids affect players, mobs, drops and rocks

**Priority:** P2 - **Status:** Done (2026-10-13) - **Depends on:** 052, 054

## Decisions
- Entities in fluid are **slowed** by the fluid's viscosity scaled by submersion depth. Shared movement logic for players and mobs (client prediction must match the server, ticket 026).
- Dropped items and rocks (Planck bodies): **buoyancy and drag** from fluid density and submerged fraction, applied as forces each step. No swimming or drowning yet.
- Fluid sounds (enter/exit/splash) moved to ticket 062 with the other fluid sound slots, so all fluid sound work is done once through the sound library.

## Tests
Slowed movement matches on client and server, a light drop floats and a heavy one sinks, prediction does not desync.

## Decisions (made on the owner's instruction to keep going; flag if wrong)
- **How much it slows:** `1 - viscosity x submerged fraction of the body's height` (so wading is slowed less than being under; viscosity 1 at full depth means cannot move). Walking and climbing scale by that factor.
- **Jumping:** scaled by the square root of the factor (jump height goes with speed squared), so a pool can still be climbed out of.
- **Falling:** the top fall speed scales by the factor too, never below 20% of normal (`FLUID_MIN_FALL_FACTOR`), so a body always sinks, slowly. Because ticket 046's fall damage comes from the impact speed, landing in fluid hurts less with no special case.
- **Which fluid counts** when several touch the body: the deepest one.
- **Loose bodies (dropped items, rocks, dynamite):** buoyancy is Archimedes (fluid density over body density, times how submerged, times its weight), so a body lighter than the fluid floats and a heavier one sinks more slowly; plus drag from viscosity (`FLUID_BODY_DRAG`). Bodies in fluid are kept awake. Today's defaults: items density 1.0 sink in oil (0.8), rocks 4.0 sink; they will float on a denser fluid such as water or lava.

## Implementation notes
- **Shared:** `fluidSubmersion.ts` (`sampleFluidContact`, `fluidMovementFactor`, `movementFactorAt`, `FluidEnvironment`), `physics/fluidForces.ts` (`applyFluidForces` on a Planck world). `MiningPhysicsBody` gets `fluidEnvironment` and `movementFactor`, refreshed every `update` (a body not asked to move that tick is still held to the right fall speed), and used by `MiningPlayerBody.processInputs` and `MiningMobBody.processMovement`.
- **Prediction:** the client's predicted body gets the client's own `FluidRenderer.environment` (its copy of the fluid grid plus each fluid's viscosity and density, now part of the fluid definition sent at join), so it wades the way the server's body does and does not rubber-band. The small difference between the server's exact levels and the client's 1/128 steps is far below the reconciliation tolerance.
- **Server:** `MiningFluidSubsystem.environment` / `applyBodyForces` (tick step 1.5, before the rigid world steps); player and mob bodies are pointed at it before they move.
- **Tests:** shared submersion (12), bodies in fluid (11), Planck forces (9); server room tests (player and mob slowed, light item floats and heavy sinks, falling brake; 12 total in that file); client environment. Mutation-checked: not re-reading the fluid each step, not pointing the player or the mob at the environment, and skipping the force step each fail a test.
- Not covered automatically: the client's prediction effect hookup in `MiningGrid.tsx` (the component is mocked in its tests). Judged in the game.
