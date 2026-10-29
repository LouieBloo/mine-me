# 108 - Mission data model, objective registry and loader

**Priority:** P1 - **Status:** Built; waiting for you to try it - **Depends on:** none (first of the mission epic 108-116)

## Problem
Each mine run should have a goal. Today a run has no objective: the player mines, fights and exits. We want missions: mine N of an item, kill N of a mob, clear (destroy) a gas or fluid, reach a depth, and later pump a fluid out.

## Decisions (2026-10-22, from the owner)
- **Missions are data rows**: a `Mission` template with typed objectives, loaded at server start and reloaded after an admin save. Objective types are a registry entry (like motion presets or `ROCK_SHAPES`), never per-mission code, so a new type is easy to add.
- **Count scales with level:** low-level runs have 1 objective, harder tiers have more (2-3), with larger amounts and better rewards. Each template has a level range and a tier.
- **Rewards are authored per mission** in data: Sol, XP and an item drop table (reuse `DropTable`). No pricing formulas.
- **Mid-run bonus goals (NPC rescue) are dropped for now**, since there are no NPCs besides mobs. The tracker (109) must still accept objectives added mid-run by any source (`addObjective`) so encounters can be added later without a rewrite.
- No abandoning: leaving the mine fails the mission (see 113).

## Proposed design
- `Mission` table: `key`, `name`, `description`, `minLevel`, `maxLevel`, `tier`, `weight`, `objectives` (JSON list), `rewardSol`, `rewardXp`, `rewardDropTableId`, `requirements` (optional map needs, see 110).
- Objective shape (shared type): `{ type, targetId?, amount, ... }`. Types: `MINE_ITEM` (item id), `KILL_MOB` (mob id; any mob if empty), `CLEAR_FLUID` (fluid id, cells to clear), `CLEAR_GAS` (gas id, cells to clear), `REACH_DEPTH` (depth in small blocks, original value x `BLOCK_SCALE`), `PUMP_FLUID` (later, 115).
- `OBJECTIVE_TYPES` registry in `packages/shared`: per type a validator, a label formatter for the UI, the map requirements it implies (110) and the event it listens to (109).
- Shared types `MissionDefinition` and `ObjectiveDefinition`, loader in `definitionLoaders`; dev JSON mirror only. Targets reference items, mobs, fluids, gases by id, never by hard-coded name.

## Tests
Loader maps rows to definitions; registry validators reject bad targets/amounts; level filtering helper; unknown type rejected.

## Built (2026-10-27)
- **Data:** a `Mission` table (key, name, description, level range, tier, weight, `objectives` JSON, Sol, XP, `rewardItems` JSON in the shape of drop table entries, `soundEffects` JSON), pushed additively. Shared `MissionDefinition`, `ObjectiveDefinition`, `MissionRewardItem` and the wire views in `types/mission.ts`.
- **Registry:** `OBJECTIVE_TYPES` in `packages/shared/src/gameLogic/mission/objectiveTypes.ts` (MINE_ITEM, KILL_MOB, CLEAR_FLUID, CLEAR_GAS, REACH_DEPTH, and PUMP_FLUID registered but `available: false`, so it cannot be saved until 115). Per type: label, target kind, unit, amount limits, `validateObjective`, `describeObjective` (the sentence the player reads), `formatProgress`. `validateMission` in `missionRules.ts` (key, name, levels, tier, weight, 1-5 objectives, reward, targets exist, an item must be dropped by some block, a depth must fit the map).
- **Loader:** `definitionLoaders` loads missions (oldest first) and resolves their sounds; `MiningDataManager.getMissions/getMission/getBlocksDropping`; dev mirror `missions.json` written by admin saves and by the seed script; `/missions` triggers the definition reload.
- **Sounds:** three slots (`objective`, `complete`, `failed`) through the sound library (`MISSION_SOUND_SLOTS`, `PATCH /api/admin/missions/:id/sound-effects/:slot`, shown in the sound usage index).
- **Seed:** `prisma/add-first-missions.ts` (dry run by default; applied 2026-10-27): eight starter missions over three tiers using real item, mob, gas and fluid names.
- Tests: registry validation and descriptions, mission validation, offer roll, loader, sound slots, seed script. Mutation-checked below (109, 110, 111, 113).

## Decisions (assumed, to confirm) - built
- Reward items are a JSON list on the mission (the shape of a drop table entry, rolled with the same `rollDropTable`) rather than a `DropTable` row, because a drop table row belongs to exactly one mob, block or level.
- The optional map `requirements` column (biome needs) was not built: nothing needs it yet. The map needs of each objective are derived from the objectives (110).

## Decisions (2026-10-28, from the owner)
- **Clear objectives are an amount of cells, not a percent.** `CLEAR_FLUID` / `CLEAR_GAS` `amount` = cells to clear (a full cell counts 1, partly filled cells add up; 1-1000). Built: registry unit `count`, label "Clear 150 cells of the Water", admin label "Cells of the fluid to clear". The starter missions were converted by `prisma/convert-mission-clear-cells.ts` (applied to the dev DB): Clear the Air 50% -> 10 cells, Burn the Oil 40% -> 40 cells; `add-first-missions.ts` seeds the same.
- **Reward items stay a JSON list** on the mission (not a shared drop table).
- **The optional biome `requirements` column is not built** (nothing needs it yet).
