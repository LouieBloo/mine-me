# 110 - Map generation guarantees the mission is achievable

**Priority:** P1 - **Status:** Open - **Depends on:** 108 (and 095-096 if a mission requires a biome)

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
