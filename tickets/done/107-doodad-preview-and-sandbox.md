# 107 - Doodad admin preview and sandbox placement

**Priority:** P2 - **Status:** Done (closed by the owner 2026-10-26) - **Depends on:** 099, 102, 103

## Proposed design
- Admin Doodads page preview: a small scene showing the doodad on a floor/ceiling/wall of fake blocks (per its anchor) with its motion, light, particles and sound playing, a wiggle test (drag a dummy body past it), and a pivot/origin editor in the same style as `ItemHoldPreview`.
- Sandbox mode (065): a tool to place and remove doodads by hand, and a toggle to run the generator's doodad pass on the sandbox map, so a doodad bug can be reproduced as a scene first.
- Test scenes are named, like `fluidScenes.ts`.

## Tests
Preview component tests; sandbox placement and removal reuse the server path from 105.

## Admin preview built (2026-10-24, stage 5)
- `components/DoodadPreview/`: a canvas scene with fake blocks on the doodad's anchored side (floor, ceiling, wall left/right, or open air), composed by the pure `composePreviewFrame` (`doodadPreviewScene.ts`) from the **shared** layout, motion presets, reaction spring and wander code, so it matches the game. The client's `DoodadRenderer` itself cannot be imported into the admin (no client alias), so the drawing (`drawDoodadPreview.ts`) is a small canvas copy of it, and the placeholder shapes per anchor mirror the game's.
- Plays motion, the light (steady/pulse/flicker, also from a pulse/flicker motion), the falling drip, and the particle effect with the admin's own `ParticleEngine` in a transparent Pixi overlay (`useParticleOverlay`); a spore puff plays from the particle origin when the dummy brushes a reacting doodad.
- **Wiggle test:** press and drag on the scene to move the dummy body (or "Sweep dummy past"); the shared `DoodadReactionSystem` leans the doodad and counts puffs. **Bug scare:** the same dummy scares a wandering doodad with the game's rule (moving body in reach, or any body right on top).
- **Origin editor:** markers for the anchor point (white), particle origin (amber), light (blue) and part pivots (pink), and `OriginOffsetCard`s (as in `ItemHoldPreview`) to move the particle and light origins; the editor saves them with the doodad.
- Ambient sound test button (volume and loop from the slot), size-variant picker, wall side toggle, pause, marker toggle, loop-time readout.

## Sandbox half built (2026-10-24, stage 6)
- **Place and remove by hand:** two new left-click tools in the sandbox panel ("Place doodad" with a picker, "Remove doodad"). `SandboxTools.placeDoodad` takes the clicked tile as the point where the doodad's anchored edge touches: the middle of the bottom row (floor), of the top row (ceiling), of the side against the wall (wall; it picks the side that has a wall and mirrors the right-hand one), the centre (air). It must fit the way the generator fits one (open footprint, solid anchor edge, `doodadPlacementProblem`) and says why when it does not. It uses `MiningDoodadSubsystem.add/removeAt` (so the wire deltas and the 105 removal rules are the real ones); remove works on any tile of the footprint; "Remove all doodads" clears the room.
- **Generator toggle:** "Generate doodads" turns the generator's pass on for the sandbox map (`engine.sandboxDoodadsRequested`, kept across resets) and rebuilds the map for everyone. It runs the real `generateDoodadPlacements` over the sandbox's ground rows (`generateSandboxDoodads`), with the **biome bands** (ticket 142) answering for the biome shares, so a doodad linked to one biome stands only in that band. Off by default.
- **Named scenes** (`sandbox/doodadScenes.ts`, picker in the panel, like the extractor scenes): Floor row, Ceiling row, Walls, Bug field (4 of every wandering kind), Reaction lane (packed reacting floor doodads) and Everything. Each clears the scenery, lays the room's real doodad kinds (every size) in the long hall, and puts the player on the hall floor in front of the row.
- Events: `sandbox_place_doodad`, `sandbox_remove_doodad`, `sandbox_clear_doodads`, `sandbox_set_doodad_generation`, `sandbox_load_doodad_scene`; the panel gets `doodads` and `doodadScenes` in `SandboxClientInfo` (absent when the room has no doodad kinds) and `doodadsGenerated` in the status.
- Tests: `sandbox/doodadSandbox.test.ts` (placing per anchor, refusals, removal path, generator toggle and bands, scenes), handler tests, client action/hook/controller/panel tests. Mutation checked: skipping the anchor support check and reading the band at the wrong row each fail tests.

## Decisions (assumed, to confirm)
- Hand-placed doodads always use the first size (variant 0); scenes lay out every size.
- The "Everything" scene and the others use the long hall (not the surface), because the surface is crowded with the block patches, pools and the extractor's spot.
- The toggle rebuilds the whole sandbox (like Reset), because the generator needs the finished map.

## First doodads and art
- `prisma/add-first-doodads.ts` (dry run by default, NOT applied yet): twelve doodads with no pictures (cave mushroom, glow mushroom, grass tuft, stalactite, stalagmite, dripping stalactite, glow crystal, icicle, lava vent, wall moss, firefly, cave beetle), linked to the eight biomes. A generated mine gets roughly 70-90 of them. `gemini_tasks/doodads-art.md` is the art brief.
