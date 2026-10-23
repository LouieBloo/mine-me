# 107 - Doodad admin preview and sandbox placement

**Priority:** P2 - **Status:** Open - **Depends on:** 099, 102, 103

## Proposed design
- Admin Doodads page preview: a small scene showing the doodad on a floor/ceiling/wall of fake blocks (per its anchor) with its motion, light, particles and sound playing, a wiggle test (drag a dummy body past it), and a pivot/origin editor in the same style as `ItemHoldPreview`.
- Sandbox mode (065): a tool to place and remove doodads by hand, and a toggle to run the generator's doodad pass on the sandbox map, so a doodad bug can be reproduced as a scene first.
- Test scenes are named, like `fluidScenes.ts`.

## Tests
Preview component tests; sandbox placement and removal reuse the server path from 105.
