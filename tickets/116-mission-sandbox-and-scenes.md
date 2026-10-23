# 116 - Missions in sandbox mode and test scenes

**Priority:** P2 - **Status:** Open - **Depends on:** 109, 112

## Proposed design
- Sandbox mode (065) gets a mission picker: choose any mission or build a one-off objective list, start it on the hand-built map, and a button to force-complete or reset it.
- Named test scenes for audit cases (like `fluidScenes.ts`): clear a gas pocket, kill a mob through fire, reach a depth, mine N items. Reproduce a mission bug as a scene first.
- `PROFILE_SANDBOX` style check that the tracker's polling cost is small (add a "missions" step through `runStep` so it appears in the F3 profiler).

## Tests
Scenes complete their objective in an engine test; reset works; the profiler step is reported.
