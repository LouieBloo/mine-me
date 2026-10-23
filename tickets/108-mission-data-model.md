# 108 - Mission data model, objective registry and loader

**Priority:** P1 - **Status:** Open - **Depends on:** none (first of the mission epic 108-116)

## Problem
Each mine run should have a goal. Today a run has no objective: the player mines, fights and exits. We want missions: mine N of an item, kill N of a mob, clear (destroy) a gas or fluid, reach a depth, and later pump a fluid out.

## Decisions (2026-10-22, from the owner)
- **Missions are data rows**: a `Mission` template with typed objectives, loaded at server start and reloaded after an admin save. Objective types are a registry entry (like motion presets or `ROCK_SHAPES`), never per-mission code, so a new type is easy to add.
- **Count scales with level:** low-level runs have 1 objective, harder tiers have more (2-3), with larger amounts and better rewards. Each template has a level range and a tier.
- **Rewards are authored per mission** in data: coins, XP and an item drop table (reuse `DropTable`). No pricing formulas.
- **Mid-run bonus goals (NPC rescue) are dropped for now**, since there are no NPCs besides mobs. The tracker (109) must still accept objectives added mid-run by any source (`addObjective`) so encounters can be added later without a rewrite.
- No abandoning: leaving the mine fails the mission (see 113).

## Proposed design
- `Mission` table: `key`, `name`, `description`, `minLevel`, `maxLevel`, `tier`, `weight`, `objectives` (JSON list), `rewardCoins`, `rewardXp`, `rewardDropTableId`, `requirements` (optional map needs, see 110).
- Objective shape (shared type): `{ type, targetId?, amount, ... }`. Types: `MINE_ITEM` (item id), `KILL_MOB` (mob id; any mob if empty), `CLEAR_FLUID` (fluid id, percent), `CLEAR_GAS` (gas id, percent), `REACH_DEPTH` (depth in small blocks, original value x `BLOCK_SCALE`), `PUMP_FLUID` (later, 115).
- `OBJECTIVE_TYPES` registry in `packages/shared`: per type a validator, a label formatter for the UI, the map requirements it implies (110) and the event it listens to (109).
- Shared types `MissionDefinition` and `ObjectiveDefinition`, loader in `definitionLoaders`; dev JSON mirror only. Targets reference items, mobs, fluids, gases by id, never by hard-coded name.

## Tests
Loader maps rows to definitions; registry validators reject bad targets/amounts; level filtering helper; unknown type rejected.
