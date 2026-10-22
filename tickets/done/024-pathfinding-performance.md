# 024: Pathfinding performance and staggering

- **Status:** Done
- **Priority:** P3
- **Area:** shared AI
- **Source:** Mining game audit

## Problem
A* (`MiningPathfinder.ts`) uses `openSet.sort` + `shift` per iteration; runs synchronously in the tick per mob every 1s or when the target moves >1.5 tiles. The AI context rebuilds the players array per mob per tick.

## Proposed approach
Binary heap, staggered/time-budgeted path updates, shared per-tick player snapshot, path caching.

## Acceptance
- Benchmark with N mobs shows bounded tick time.

## Decisions (2026-10-09)
Reviewed with the owner afterwards: confirmed as is (4 searches/tick, no path caching).
Owner asked to keep moving; defaults chosen: heap A*, a global per-tick search budget (`MOB_PATHS_PER_TICK = 4`), per-mob re-path interval jitter, one player snapshot per tick. Path caching was not added: with the 1 s re-path timer and the budget it would add invalidation complexity for little gain.

## Implementation notes
- `MinHeap` (shared, tested) replaces `sort` + `shift` in `MiningPathfinder`; cells are keyed by a number (`y*W+x`) instead of strings; lazy deletion for improved routes.
- `TickPathBudget` / `PathRequestBudget` (in `BaseMobAI.ts`): `MobAIContext.pathBudget`; `ChaseAndMineAI` asks before every A* and, when refused, keeps its current path and asks again next tick (the direct-approach fallback covers an empty path). The mob subsystem resets the budget each tick.
- Re-path interval is `1.0 + 0..0.5 s` derived from the mob's instance id, so a crowd doesn't re-path in lockstep.
- `players` for the AI context is built once per tick and shared by all mobs.
- Tests: pathfinder behaviour (walk, jump, mine vs no-mine, ladder, depth cap, throughput), heap, budget, and an engine test with 60 chasing mobs: at most 4 searches in any tick, every mob still gets a path, intervals differ, a tick stays under the 33 ms frame budget. Mutation-checked (removing the budget check fails the bound test).

