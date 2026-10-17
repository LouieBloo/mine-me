# 083 - Fluid rendering: motion by animation, not moving shapes

**Priority:** P1 - **Status:** Done (2026-10-17; judge the look in the game and the admin preview) - **Part of:** fluid overhaul epic (081-084) - **Depends on:** 082

## Problem
Fluid looks good standing still and bad moving. The client shows motion by sliding and stretching shapes between the 10 Hz simulation steps (`FluidDisplay` easing, `hurry`, the `fallProgress` slide). Those shapes then go wrong (see 082). The flat sheen `rect` on streams (`FluidRenderer.ts:327`) makes it worse.

Reference: Minecraft keeps the shapes steady and shows flow with an animated texture. Falling water scrolls down and flowing water scrolls along its slope.

## Design (confirmed 2026-10-17; Decisions below override anything here)
- **Draw 082's per-cell shapes** in `FluidRenderer` (client) and `FluidPreview` (admin) through one shared drawing path, so the two never drift apart.
- **Flow animation:** falling cells get a pattern scrolling downwards. Sloped surface cells scroll along the slope, faster the steeper it is. Still cells do not scroll. The pattern lines up with world position and time (like `fluidWaveHeight`), so neighbouring cells line up and chunk redraws never restart it. Its speed and strength come from the fluid's `appearance` (new fields such as `flowSpeed` and `flowStreaks`, with the same defaults/range/validator pattern as `waveAmplitude`). Thick fluids like lava scroll slowly.
- **Smoothing:** each cell's drawn level eases towards the server's (one short ease, about 0.1 s, as `FluidDisplay` does now), so a 1-unit change slides instead of snapping. A cell starting or stopping falling fades its scroll in or out. No `hurry`, no slide, no per-cell guessing.
- **Waves:** only on `surface` cells, and pinned to zero where a surface meets a falling column or a wall, so a wave can never open a gap at a join.
- **Remove** the stream sheen. Depth shading, the surface highlight and the glow (`FluidGlow`) stay, and read the new shapes.
- **Performance:** keep 8x8 chunks. Static bodies redraw only when cells change. Only chunks with surfaces or flow animate each frame.

## Open questions
All answered 2026-10-17 (see Decisions).

## Decisions (Q&A 2026-10-17)
- **The flow pattern is generated in code** from the fluid's colours. No art uploads, no new asset field.
- **Only falling cells scroll** in this ticket; flow along slopes is a later ticket if wanted.
- Falling speed unchanged (10 tiles/s); the scroll speed is its own appearance setting.
- **Still pools keep their current waves** (`waveAmplitude` / `waveSpeed` unchanged).
- Choose between the GL filter and the `TilingSprite` approach on cost; prefer `TilingSprite` unless it shows seams at chunk edges.


## Checklist
Shared appearance fields + defaults + validator, admin appearance form and preview, client renderer, glow, tests. No DB column (appearance is Json).

## Tests
Renderer: draws one shape per filled cell, falling cells marked to animate, still cells not; scroll offset depends only on world position and time (two chunks agree at their edge); waves are zero at a join with a falling column; easing reaches the target and stops; chunks redraw only when their cells change. Admin preview uses the same drawing path. Shared appearance defaults/validation for the new fields. The final look is judged by the owner in the game and the admin preview.

## Notes for the implementer (gotchas found while writing this ticket)
- **The admin preview is Canvas 2D, not Pixi** (`FluidPreview.tsx` uses `getContext('2d')`). "One shared path" means shared geometry and shared maths (082's shapes, `fluidWaveHeight`, a shared `flowScrollOffset(worldY, time, appearance)`, `fluidDepthShade`), drawn by two thin painters. Don't try to run Pixi in the admin.
- **Pixi v8 shader pattern already exists:** `apps/client/src/components/game/shaders/TerrainEdgeFilter.ts` (`Filter` + `GlProgram.from`, `UniformGroup`). The game runs WebGL (no `GpuProgram` in the repo), so a GL-only program is fine. Follow that file.
- **The cheaper option if a filter is too much:** build a small streak texture at runtime from the fluid's colours (no asset, nothing to preload), put a `TilingSprite` per chunk masked by that chunk's falling cells, and scroll `tilePosition.y`. Scroll by world position (`tilePosition.y = time * speed - chunkOriginY`), so chunks line up and a redraw never restarts the pattern. `setupTests.ts` already mocks `TilingSprite`.
- **Don't rebuild Graphics every frame for the animation.** Today animated chunks redraw their surface `Graphics` each frame. The scroll should only change a uniform or a `tilePosition`. Rebuild Graphics only when cells change.
- **Draw order:** fluid sits above tiles and behind every entity (ticket 054), and the lighting is applied over it. Anything new goes inside the existing per-chunk `root` container so this holds.
- **Waves:** `waveRoom` already scales waves by a 0..1 weight per side. Set that weight to 0 at a join with a falling column or a wall, so the wave line meets the fall exactly.
- **Appearance fields:** add them to `FluidAppearance`, `DEFAULT_FLUID_APPEARANCE`, the range table and the validator in `packages/shared/src/types/fluid.ts`, plus the admin appearance form. It is Json, so no schema change. Old rows without the fields get the defaults through the existing "made whole" function.
- **Remove** the stream sheen `rect` and its test in `FluidRenderer.test.ts`.
- The owner judges the final look. Leave the defaults easy to tune in the admin.

## Implementation notes (2026-10-17)
- **Streaks**: `fluidFlow.ts` `fluidFlowStreaks(cx, cy, tile, time, appearance, fromY)`: three thin dashes per cell, positions from the column (hash), the world y and the time only, so they run on unbroken down a fall and a redraw never restarts them. New appearance fields `flowSpeed` (cells per second, default 2.5, 0-12) and `flowStreaks` (0-1, default 0.5), with limits, defaults, validation and admin form fields. Old rows get the defaults.
- **Client**: per-chunk `flow` Graphics between the body and the surfaces; redrawn every frame only for chunks that hold falling cells whose fluid has streaks (`chunk.flowing`); the body (the shape of a fall) stands still. Deviation from the notes: plain `Graphics` rects, not a `TilingSprite` or filter: a fall has few cells and three rects each, and it avoids masking and chunk-edge seams. Worth revisiting only if a profile says so.
- **Display**: falling fluid, and a cell it leaves, is shown at once (`FluidDisplay.setTarget` snaps and returns whether something changed); resting fluid still eases over 0.12 s. `hurry`, the slide and `fallProgress` are gone. `FluidRenderer.markAround` now marks the cell and its neighbours, plus the cells below it in its column (their depth shading depends on the top).
- **Removed** the stream sheen. Waves unchanged for pools; their weight is 0 at a join with a falling or covered neighbour and at the ends of a pool.
- **Admin preview** (Canvas 2D) draws the same shapes, the same streaks and the same strength; the game's lava is drawn in its own colour in the lava scene.
- **Not done**: slope scrolling (decided: later), per-fluid defaults for slow fluids in the database. Lava should have a low Flow Speed set in the admin (the `appearance` column is data; no script was run).
- **Tests**: `fluidFlow.test.ts` (7), `FluidRenderer.test.ts` (falling cells snap, only the streaks redraw, not redrawn when still or without streaks, streaks stay inside their cells), `fluidDisplay.test.ts`. Mutation-checked: scrolling, column-based placement and falling snap.
