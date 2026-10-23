# 109 - Objective tracking engine

**Priority:** P1 - **Status:** Open - **Depends on:** 108

## Decisions (2026-10-22, from the owner)
- **MINE counts items actually collected into the backpack**, not blocks broken, so it matches the loot and a lost drop doesn't count.
- **KILL counts any team kill, including fire, fluid and blasts**: a mob dying counts when the damage chain traces to a player (including ignition and explosions). A mob killed by the environment alone does not count.
- **CLEAR_FLUID / CLEAR_GAS are a percent of the original amount removed**: the tracker records total units at map start and compares with now (fluid units are whole 16ths, use the shared getters/`drainFluid` accounting). Complete at the objective's percent (for example 90%). Pumping later (115) reuses the same counter with a "pumped out" source.
- **REACH_DEPTH** completes when any player's deepest depth below the surface (`surfaceRow`, ticket 139) reaches the target.
- **Shared team progress** with per-player credit recorded (contribution counts per player).

## Proposed design
- `MissionTracker` (server, pure and testable) owned by the mining engine: `start(mission, mapInfo)`, `onItemCollected`, `onMobKilled`, `onDepth`, `tick` for cheap polling of fluid/gas totals (a few times a second, not every tick), `addObjective` (for later sources), and `snapshot()`.
- Hooks go in the existing paths: pickup, the unified damage pipeline's death handling (carry the last player source through fire, fluid, gas and blast damage), and the depth update. Do not add per-system special cases.
- Each objective has `progress`, `target`, `done`, and `contributions: { playerId -> amount }`.
- Completion emits an event on the engine (consumed by 112 and 113).
- Start totals for fluid/gas are computed once after generation; evaporation and flow don't change the baseline.

## Open questions for the owner
1. ~~Co-op reward split~~ Decided (2026-10-22, owner): every player who exits safely gets the full reward; contributions are still recorded for the results screen.
2. ~~Late join~~ Decided (2026-10-22, owner): a player who joins mid-run shares the mission and the current progress, and is eligible for the reward.

## Tests
Each objective type's progress, completion and no double-counting; kill attribution through fire, fluid and blast; fluid/gas percent math; contribution tracking per player; `addObjective` mid-run. Mutation: count blocks instead of pickups -> a test fails.
