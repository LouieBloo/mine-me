# 084 - Fluid test scenes (repeatable cases from the audit)

**Priority:** P2 - **Status:** Done (2026-10-17) - **Part of:** fluid overhaul epic (081-084) - **Depends on:** 081 (built alongside 081-083)

## Problem
Fluid bugs are found by eye in the game, on whatever terrain the generator made, and are hard to reproduce. Every case in `FLUID_AUDIT.md` (a jet poking above a wave, a stick along a cliff, a wedge at the foot of a fall, a ladder shaft) needs a fixed, repeatable scene. Then each fix can be tested automatically and checked by eye.

## Design (confirmed 2026-10-17; Decisions below override anything here)
- A shared set of named scenes (small hand-built grids of terrain plus starting fluid): a pool spilling off a ledge, a waterfall into a pool, a pool spilling down a ladder shaft, a trickle down a cliff face, a U-bend, lava meeting water, a one-wide shaft, and a bucket poured in mid-air.
- **Automated:** each scene is run through `FluidGrid` and the 082 layout for N steps in shared tests. They check settle time, conservation, no endless trickle, no seams, no wedge, and that falling cells are stable.
- **By eye:** the admin Fluid preview gets a scene picker (it already runs `FluidGrid` and draws with the shared layout), so the owner can watch each case with any fluid's settings. Optionally the sandbox can load a scene too.

## Open questions
All answered 2026-10-17 (see Decisions).

## Decisions (Q&A 2026-10-17)
- **Scene picker in the admin Fluid preview only.** No sandbox loading.
- Scenes: the list in the design section. The owner may add cases after trying the new fluid.


## Tests
The scene tests above, plus a test for the admin picker (choosing a scene resets the preview to it).

## Notes for the implementer
- Put scenes in shared code (e.g. `packages/shared/src/gameLogic/fluid/fluidScenes.ts`) as plain data: an ASCII map (`#` solid, `.` air, `H` ladder, `w` water, `l` lava), parsed by one helper, so tests and the admin preview use the same source. Ladders are non-solid (`isTileSolid` is false), and the scene's solid function must agree with that.
- The admin preview already has a fixed scene (`previewScene.ts`: `SPOUT`, `POUR_RATE`, `PREVIEW_WIDTH/HEIGHT`). Turn it into "the default scene" in the new list rather than keeping two systems.
- Write the scene tests first, against the current simulation, and note which fail (expect the trickle, wedge and pulse checks to fail). That gives 081-083 a clear target.

## Baseline (run against the old simulation before 081)
Failed: the U-bend never settled (pressure kept it moving), the waterfall's falling cells pulsed from step to step, the ladder shaft lost its water to thin-film evaporation (0.45 of a cell reached the chamber), and the mid-air blob smeared and evaporated (0.32 of a cell survived). Passed (weakly): conservation, no hanging fluid, level neighbours, ledge, one-wide shaft, lava.

## Implementation notes (2026-10-17)
- **`fluidScenes.ts`**: nine named scenes as ASCII maps (`#` rock, `.` air, `H` ladder, `w`/`l` a full cell of water/lava, `S` a spout), `FluidSceneRunner` (real `FluidGrid`, spouts, gate, reactions turn spent lava into rock, `settle()`, `toField()`), `SCENE_FLUIDS` (a mirror of water and lava's physics). The tank's gate is data on the scene.
- **Tests** (`fluidScenes.test.ts`, every scene): settles with nothing left awake, conserves what was poured, nothing hangs over air, resting neighbours are level, drawing has no seams while pouring and once settled. Plus: steady fall, flat spread under a fall, ledge, ladder, U-bend, lava hardening, blob, one-wide shaft, gate.
- **Admin**: the preview has a Scene picker (`PreviewScene` wraps the runner; the edited fluid is what the scene's water and spouts hold, lava is the game's); Pour and Open Gate are off for scenes without a spout or gate; canvas size follows the scene.
