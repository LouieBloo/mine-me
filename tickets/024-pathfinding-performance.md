# 024: Pathfinding performance and staggering

- **Status:** Open
- **Priority:** P3
- **Area:** shared AI
- **Source:** Mining game audit

## Problem
A* (`MiningPathfinder.ts`) uses `openSet.sort` + `shift` per iteration; runs synchronously in the tick per mob every 1s or when the target moves >1.5 tiles. The AI context rebuilds the players array per mob per tick.

## Proposed approach
Binary heap, staggered/time-budgeted path updates, shared per-tick player snapshot, path caching.

## Acceptance
- Benchmark with N mobs shows bounded tick time.

## Open questions
(to be asked before work starts)
