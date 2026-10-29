# 109 - Objective tracking engine

**Priority:** P1 - **Status:** Built; waiting for you to try it - **Depends on:** 108

## Decisions (2026-10-22, from the owner)
- **MINE counts items actually collected into the backpack**, not blocks broken, so it matches the loot and a lost drop doesn't count.
- **KILL counts any team kill, including fire, fluid and blasts**: a mob dying counts when the damage chain traces to a player (including ignition and explosions). A mob killed by the environment alone does not count.
- **CLEAR_FLUID / CLEAR_GAS were a percent of the original amount removed (changed 2026-10-28: now a number of cells, see below)**: the tracker records total units at map start and compares with now (fluid units are whole 16ths, use the shared getters/`drainFluid` accounting). Complete at the objective's percent (for example 90%). Pumping later (115) reuses the same counter with a "pumped out" source.
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

## Built (2026-10-27)
- `MissionTracker` (`apps/server/src/services/mining/missions/MissionTracker.ts`): pure, owned by the engine (`engine.missionTracker`, `world.missions`). `onItemCollected`, `onMobKilled`, `onDepth`, `poll`, `addObjective`, `forceComplete`, `takeDelta`, `claim/unclaim`, `clientState`, `result`.
- **Hooks (no per-system special cases):** `MiningDropSubsystem.addToBackpack` (items that really went into the backpack, so blocks broken and drops left on the ground do not count); `MiningDamageSystem.damageMob` (a mob's death is credited to the player its damage traces to: their own hit, the owner of the bullet or the blast; for fire, a fall or a rock it goes to the player who hurt it last within 15 seconds; the environment alone and the surface target dummy count for nobody); a `missions` step in the engine tick (every player's depth, and the fluid and gas totals ten ticks apart), visible in the F3 profiler.
- **Percent goals** compare the total at the start (taken once when the tracker starts, after generation) with the total now; a map with nothing to clear counts as done. REACH_DEPTH is held within the map (never more than its depth less 2).
- Shared progress with a contribution per player (depth credits each player's own deepest point; fluid and gas percent has no single owner so it records none).
- Tests: `MissionTracker.test.ts` (each type, no double counting, baselines, deltas, claim, addObjective), `MiningGameEngine.mission.test.ts` (pickup, kill attribution through hit, bullet, blast, fire, the window, dummy, depth, wire, late-join state).

## Decisions (2026-10-28, from the owner)
- **Clear goals are cells, not percent.** Progress = cells gone since the start (start total - now, never below 0; later flow or growth does not undo it), capped at the goal. A goal bigger than what the map holds is held to what is there (and its label says the real number); a map with nothing to clear still counts the objective as done at the start. The generator guarantees `amount x 2` cells (at least one small pocket), summed per fluid/gas across objectives (110).
- **Every kill counts (co-op).** A KILL_MOB objective counts every mob death in the run, including fire, falls, rocks and gas; only the surface target dummy never counts. Per-player credit is still tracked for the results screen: the player the damage traces to, or the one who hurt it last within 15 seconds; a kill nobody can be credited with counts for the run and for nobody's contribution (`onMobKilled(null, mobId)`). Every player who exits safely still gets the full reward.
