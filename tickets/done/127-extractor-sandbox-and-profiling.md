# 127 - Extractor in sandbox mode, test scenes and profiling

**Priority:** P2 - **Status:** Done - **Depends on:** 120, 123

## Proposed design
- Sandbox (065): spawn the extractor and belt, set belt length, set capacity and weights, fast-forward belt build.
- Named test scenes (like `fluidScenes.ts`): belt blocked by water, mob attacking a segment, full pack at the belt, death with items on the belt.
- Profiler: a `belt` step through `runStep` (server) and a client phase for belt items (`miningProfiler.timeEvent`); count display objects for belt sprites.

## Tests
Scenes reach their expected state in engine tests; profiler step reported.

## Progress (2026-10-22)
- Sandbox tools (server `SandboxTools`, handlers `sandbox_spawn_extractor`, `sandbox_dig_belt`, `sandbox_set_capacity`, `sandbox_fill_backpack`, `sandbox_load_extractor_scene`; client panel section "Extractor and belt"): spawn the extractor (lands at once; the room rebuilds each client's view), dig belt segments at once (+10, or to the end), set the carry capacity, fill the pack with the heaviest item, and load a scene. A reset takes the extractor away again. The sandbox has no extractor until you spawn one (`hasExtractor` stays false for it).
- Weights are not editable in the sandbox on purpose: they are shared data, so changing one there would change it for every room. Use the Item Weights admin page; the capacity box covers the other half.
- Named scenes (`sandbox/extractorScenes.ts`, like the fluid scenes; each works through the real subsystems): belt blocked by fluid, mob attacking a segment, full pack at the belt, items on the belt then death. A death in a mode that respawns you now also loses the items you had riding the belt (before, only an ended run did).
- Profiling: `extractor` and `belt` are their own server steps (`runStep`), the performance report counts `beltSegments` and `beltItems`, the client times an "Extractor & Belt" frame section and publishes "Belt segments" and "Belt items" gauges beside the display-object count, and `profileSandbox.perf.test.ts` has two extractor cases (a busy belt: about 1.3 ms a tick, 4% of the budget; a mob chewing the belt: about 1.6 ms).
- Tests: every scene reaches its expected state in an engine test; sandbox handler, tool, panel, controller and gauge tests.
