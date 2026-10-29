# 116 - Missions in sandbox mode and test scenes

**Priority:** P2 - **Status:** Done (verified by the owner 2026-10-28) - **Depends on:** 109, 112

## Proposed design
- Sandbox mode (065) gets a mission picker: choose any mission or build a one-off objective list, start it on the hand-built map, and a button to force-complete or reset it.
- Named test scenes for audit cases (like `fluidScenes.ts`): clear a gas pocket, kill a mob through fire, reach a depth, mine N items. Reproduce a mission bug as a scene first.
- `PROFILE_SANDBOX` style check that the tracker's polling cost is small (add a "missions" step through `runStep` so it appears in the F3 profiler).

## Tests
Scenes complete their objective in an engine test; reset works; the profiler step is reported.

## Built (2026-10-27)
- The sandbox panel has a Missions section: start any loaded mission, Finish (complete everything), Restart (baselines taken again) and Drop, and a mission test scene list. The sandbox mission survives a sandbox reset. A one-off objective list can also be sent (`sandbox_start_mission` with `objectives`, checked like a saved mission).
- Scenes (`sandbox/missionScenes.ts`): **Clear a gas pocket**, **Kill two mobs**, **Reach a depth**, **Collect five items**, each starting a one-off mission and setting the room up through the real subsystems.
- The `missions` tick step shows in the server profiler (`runStep`), tested.
- Tests: each scene completes its objective in an engine test, reset/clear/complete, bad input refused, handlers for all three events, panel and controller.
