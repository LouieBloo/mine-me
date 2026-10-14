# 052 - Fluid cell simulation

**Priority:** P1 - **Status:** Done (2026-10-13) - **Depends on:** 051

## Problem
Fluids must flow like a normal fluid: fall into empty cells below, spread sideways, fill depressions, and start flowing when a neighbouring block is broken.

## Design
- A `FluidGrid` class in `packages/shared` (pure, deterministic, testable) holds per-cell `{fluidId, level}`. Server subsystem `MiningFluidSubsystem` steps it on the sim clock (ticket 013), not wall time.
- Per step, per active cell: (1) move as much as fits **down**; (2) equalise **sideways** with neighbours when the level difference exceeds `flowThreshold`; (3) allow slight over-compression upward (pressure) so U-bends level out; (4) below `minLevel` the cell evaporates.
- Only "active" cells are processed (a dirty set), so a still pool costs nothing. Breaking a block wakes the neighbouring fluid cells; placing a block displaces fluid.
- Different fluids in one cell: the denser fluid sinks; same-density mixes are not allowed (a cell holds one fluid type). Interaction rules between fluid types are a later ticket.
- The settling problem: `minLevel` + `flowThreshold` stop endless thin smear. Both per-fluid config.

## Tests
Falls straight down, fills a basin level, flows out when a wall breaks, U-tube equalises, conserves volume (minus evaporation), thin film evaporates, still pool becomes inactive, determinism (same input, same result). Mutation-check: remove the threshold, confirm the "settles" test fails.

## Decisions (052 Q&A 2026-10-13)
- **Step rate:** every 3rd tick = 10 Hz on the sim clock (`MINING_CONFIG.FLUID_STEP_TICKS`), independent of the 30 Hz physics.
- **Active area:** the whole map, only active cells processed. Fluid keeps flowing where nobody is looking.
- **Non-solid tiles** (ladders, torches, entrance): fluid flows through them and nothing is destroyed. What fire does to them is for 057.
- **Placing a block into a fluid cell:** the displaced level is pushed to a neighbour with room (up, sideways, then down); what does not fit is lost.
- Fluid flows into cells occupied by items, mobs and players (it is only blocked by solid tiles). Falling rocks are terrain-changing events that arrive through the tile update like any other.

## Implementation notes
- **Shared:** `FluidRegistry` (typeKey to a 1..255 cell id, assigned in typeKey order so ids are stable) and `FluidGrid` (`gameLogic/fluid/`). Pure and deterministic; double-buffered flows so results do not depend on iteration order; row order and left/right preference alternate each step to avoid drift.
- **Rules per step:** (1) denser fluid swaps below lighter fluid; (2) down, using the stable-bottom compression formula; (3) sideways towards a lower neighbour when the difference exceeds `flowThreshold`; (4) squeezed fluid moves up; (5) cells below `minLevel` evaporate. All flows are scaled by the fluid's `flowRate`. Different fluids never share a cell.
- **Two leak bugs found and fixed while testing:** a flow into an empty cell that would arrive below `minLevel` evaporated on arrival, so a spreading pool bled away at its edge. Sideways and upward flows now send at least the minimum (sideways) or nothing (upward). Only the tail of a falling stream still evaporates, which is the intended "minimum" behaviour.
- **Known limit:** pressure (compression) is small by design, so U-tubes level only approximately (arms end within about two cells), and a thick fluid with a high `minLevel` such as oil cannot be lifted by a shallow column at all. It does not leak trying. Tune `minLevel`/`flowThreshold` per fluid in the admin if a different feel is wanted.
- **Server:** `MiningFluidSubsystem` (registry from the loaded definitions, grid over the tile grid with `isTileSolid`), stepped in the tick as step 4.5; `MiningWorld.fluids`; `pushTileUpdate` (the one place every tile change goes through) calls `onTileChanged`. `placeFluid(x, y, typeKey, amount)` is the API for generation (053); `drainChanges()` is what the network ticket (054) will send.
- **Tests:** shared `FluidGrid.test.ts` (27: falls, spreads, basin, wall break, U-tube, conservation, evaporation, no endless smear, still pool is free, determinism, solids, densities, displacement, change reporting) and server `MiningGameEngine.fluids.test.ts` (6). Mutation-checked: removing the flow threshold (this exposed a missing test, now added), the minimum-arrival guard, the tile-update hook and the tick step each fail a test.
- **Not done here:** a performance budget check on a very large oil lake (to measure once oil generation, 053, exists); the live preview that ticket 060 will build on `FluidGrid`.
