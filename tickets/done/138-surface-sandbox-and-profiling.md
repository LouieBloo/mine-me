# 138 - Surface in sandbox mode, test scenes and profiling

**Priority:** P3 - **Status:** Done 2026-10-29 - **Depends on:** 130, 132, 133

## Proposed design
- Sandbox (065) controls: pick the environment, force a weather state and intensity, trigger lightning, toggle reduce-flashes.
- Named test scenes (like `fluidScenes.ts`): clear day, heavy rain, storm with lightning, snow, fog.
- Profiler: new "background", "clouds" and "weather particles" phases (`miningProfiler.timeEvent`); display objects counted; verify zero cost underground.

## Tests
Sandbox state changes take effect; profiler phases reported; nothing rendered underground.

## Built (2026-10-28)
- **Sandbox panel "Surface and weather":** pick the environment, force a weather at a strength (or go back to the seeded one), call a lightning strike, and load named scenes (clear day, heavy rain, storm with lightning, snow, fog, gale). Changes reach everyone in the room in the next tick; a reset clears what was forced; the status shows what is forced.
- **Profiler:** sections `Surface Background`, `Clouds`, `Weather Particles` and gauges for the surface's display objects, clouds shown, weather particles and whether it is drawn; zero when underground (a test checks that nothing is updated).
- Tests: tools and refusals, scenes, status, handlers, panel, controller, tick handler, ticker wiring, scene stats.

## Decisions (assumed, to confirm)
the sandbox starts on the default environment; scenes force a weather, they do not move the player.
