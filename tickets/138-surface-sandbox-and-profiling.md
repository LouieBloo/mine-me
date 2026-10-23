# 138 - Surface in sandbox mode, test scenes and profiling

**Priority:** P3 - **Status:** Open - **Depends on:** 130, 132, 133

## Proposed design
- Sandbox (065) controls: pick the environment, force a weather state and intensity, trigger lightning, toggle reduce-flashes.
- Named test scenes (like `fluidScenes.ts`): clear day, heavy rain, storm with lightning, snow, fog.
- Profiler: new "background", "clouds" and "weather particles" phases (`miningProfiler.timeEvent`); display objects counted; verify zero cost underground.

## Tests
Sandbox state changes take effect; profiler phases reported; nothing rendered underground.
