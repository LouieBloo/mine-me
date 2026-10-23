# 127 - Extractor in sandbox mode, test scenes and profiling

**Priority:** P2 - **Status:** Open - **Depends on:** 120, 123

## Proposed design
- Sandbox (065): spawn the extractor and belt, set belt length, set capacity and weights, fast-forward belt build.
- Named test scenes (like `fluidScenes.ts`): belt blocked by water, mob attacking a segment, full pack at the belt, death with items on the belt.
- Profiler: a `belt` step through `runStep` (server) and a client phase for belt items (`miningProfiler.timeEvent`); count display objects for belt sprites.

## Tests
Scenes reach their expected state in engine tests; profiler step reported.
