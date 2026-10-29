# 110 - Map generation guarantees the mission is achievable

**Priority:** P1 - **Status:** Done (verified by the owner 2026-10-28) - **Depends on:** 108 (and 095-096 if a mission requires a biome)

## Decisions (2026-10-22, from the owner)
- The player picks the mission **before** the map is generated, and the **generator guarantees the goal is achievable**: the mission can require things from the map, and a validator rejects maps that can't satisfy it.

## Proposed design
- Each objective type in the registry (108) reports its **requirements**: for MINE_ITEM, enough of the block(s) that drop it (with margin, for example 2x the amount); KILL_MOB, enough spawns of that mob; CLEAR_FLUID/GAS, at least one pocket of it with enough total units; REACH_DEPTH, a map at least that deep with a reachable path; optional biome requirement.
- The generator takes a `MissionRequirements` input and biases generation: it raises the weight of the needed blocks, fluid or gas pockets and mob spawn entries (in the biome-mixed tables from 096), then runs a **feasibility check** on the result (counts, reachability by digging).
- If the check fails, retry with the next derived seed up to a limit; if still failing, force-place the missing content in the nearest valid spot. Never hand the player an impossible mission.
- Existing maps without a mission generate exactly as today (sandbox, tests).
- Check generation time on the 135x135 map.

## Tests
Per objective type: generated map satisfies it over many seeds; forced placement fallback; determinism for the same seed and mission; no-mission output unchanged. Mutation: skip the feasibility check -> a test with an impossible bias fails.

## Built (2026-10-27)
- `deriveMissionRequirements` (shared, pure) turns objectives into what the map must hold: twice the blocks that drop an item (using the best block's expected drop), more mob spawns than the kill goal, a pocket of the fluid or gas (8 cells), and the depth. `missionShortfall` is the feasibility check against a `MapCensus`.
- **Generator** (`MapGeneratorOptions.mission`): tops up what the usual recipe left short, from its own random stream (so a mission never moves the rest of the map): sealed 3x3 pockets of a missing fluid or gas right after the normal pockets, and clusters of the needed block after the biome swaps (on plain ground only, never ore, rock, bedrock, the surface row or the entrance corridor). A map with no mission, or one that already meets the need, is generated exactly as before (tested).
- **Retry:** `buildMapForMode` re-checks the map and, if still short, tries up to five other derived seeds. **Mobs:** after the cave mobs are placed, `ensureMissionMobs` spawns the missing ones (the named mob, or the map's own mobs taking turns for "any").
- Generation time stays 100-180 ms on the 135x135 map with any of the starter missions.
- Tests: `miningMap.mission.test.ts` (enough of a block over many seeds, pockets of a gas the recipe never makes and of a fluid, determinism, unchanged output with no mission, entrance and surface clear, the shortfall names what is missing), engine tests for the mobs.

## Decisions (assumed, to confirm) - built
- The ticket proposed biasing the weights and then checking; the built version checks and force-places natural-looking clusters and pockets, which is simpler and deterministic. The retry stays as a safety net.
- The forced blocks do not avoid the belt's shaft column (the belt digs through whatever is there).

## Decisions (2026-10-28, from the owner)
- Clear objectives are cells (see 108/109), so the map requirement for a fluid or gas is `amount x MISSION_SUPPLY_MARGIN` cells (at least one small pocket), added up per fluid/gas; the generator forces pockets until the census has enough.
