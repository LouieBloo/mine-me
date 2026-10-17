# 082 - Per-cell fluid geometry (Minecraft-style corners), replacing streams and spills

**Priority:** P1 - **Status:** Done (2026-10-17) - **Part of:** fluid overhaul epic (081-084) - **Depends on:** 081

## Problem
`FluidLayout` (`packages/shared/src/gameLogic/fluid/fluidShape.ts`, ~750 lines) draws fluid with two models that do not fit together, and works out from noisy levels which one each cell is:
- **Bodies:** each column's fluid packed down onto its floor, with one waving surface. What is drawn is not where the simulation has the fluid.
- **Streams:** narrow vertical jets (`STREAM_MIN_WIDTH`, `wallBias`), plus **spills** (Bezier arcs over a lip, only where `lipShare` finds ground), **blobs** (`BLOB_MAX_ROWS`) and gap bridging.
- About fifteen tuning constants and ramps exist only to stop the guesses flickering. Wherever they guess wrong you get the artifacts in `FLUID_AUDIT.md`: a jet poking above the wave, a stick along a cliff, seams where a pool meets a fall.

## Design (confirmed 2026-10-17; Decisions below override anything here)
Draw every cell on its own from its level and its neighbours, like Minecraft in 2D. Neighbouring cells share their corners, so there are no seams.
- **Falling cell** (081's falling bit): a full-width column. Full height when the same fluid is above it; see the lip rule below otherwise. Fainter when thin (see Decisions).
- **Fluid above it:** the cell is drawn full height (no gap between stacked cells).
- **Otherwise a resting cell** has a left and right corner height. Each corner is the average of the surface heights of this cell and the neighbour on that side, if the neighbour holds the same fluid and is open to it. A **covered** neighbour (same fluid in the cell above it) counts as full, so a pool's edge rises to meet a waterfall coming down beside it. Air, a wall or a different fluid on that side: this cell's own height. So water slopes over a ledge into a fall, and a pool meets a wall flat.
- **The top of a falling cell with nothing above it (the lip of a fall)** is NOT full height. Each top corner takes the neighbour's surface on that side if the neighbour holds the same fluid; otherwise it uses the cell's own level. The sheet then leaves the pool flush with its surface. Drawing it full height brings back the audit's "jet poking above the wave" bug (see the implementer notes).
- **Output:** a simple shape per cell: `{ x, top, bottom, topLeft, topRight, falling, surface, depth }`. `surface` is set when nothing of the same fluid is above it (waves and the highlight go here only). `depth` is cells below the column's top surface, for shading.
- **Kept API:** `surfaceAt(cx, cy)` (fire puts flames on the surface), `fluidDepthShade`, `fluidWaveHeight`.
- **Deleted:** column packing (`ColumnBody`), `StreamSegment`, `spillShape`/`lipOf`/`lipShare`, blobs, gap bridging, `openness`, `freeFallShare`/`fallHurry`, `fallProgress`, and the `STREAM_*`, `SPILL_*`, `SUPPORT_*`, `DROP_*`, `JOIN_*` constants. Their tests (`fluidShape`, `fluidFalls`, `fluidPourRegression`, `fluidFallingWire`) are replaced by this ticket's tests.
- The layout no longer needs the solid sampler to tell streams apart. It still needs it to know a wall from air when averaging corners.
- Ladders and other non-solid tiles are simply open (the simulation lets water through them), so there is no special case.

## Open questions
All answered 2026-10-17 (see Decisions).

## Decisions (Q&A 2026-10-17)
- **Falling cells are always full width.** No narrow streams.
- **A thin fall is fainter, not narrower:** a falling cell's opacity scales with how much it holds, from about 40% of the fluid's opacity at 1 unit up to the full opacity at 8 units (half a cell) or more: `alpha = opacity * lerp(0.4, 1, clamp01((units - 1) / 7))`. Add the factor to the shape (e.g. `strength` 0..1) so both painters (game and admin) use it. Constants live in shared code.
- A thin film on a slope follows the corner averages (Minecraft); 1-unit films on flat ground evaporate anyway (081).


## Tests
Pure shared tests on small hand-built grids: a flat pool has equal corners; a pool beside a waterfall rises to it; a pool against a wall is flat; neighbouring cells always share the corner they meet at (property test over random grids: no seams); a falling cell is full width and full height; a stacked column has no gaps; `surface` is set on exactly the top cell of each column of fluid; `surfaceAt` matches what is drawn; a ladder shaft behaves like open air; at a lip the top of the falling cell is level with the pool beside it (never above it). Mutation-check: corner sharing, "a covered neighbour counts as full" and the lip rule.

## Notes for the implementer (gotchas found while writing this ticket)
- **The lip rule matters most.** A falling cell is drawn full height ONLY when the same fluid is in the cell above it. At the lip of a fall (pool at row y in column x, falling cell at row y in column x+1 with nothing above), the falling cell's top corners come from the pool's surface. Drawn full height, it would stick up above the pool by `(1 - poolLevel)` of a tile, which is the exact bug in `FLUID_AUDIT.md` (Artifact A). Test it.
- **Average only across the same fluid.** Oil on water, or lava next to water, are separate surfaces: treat a different fluid like a wall when averaging corners.
- **Match submersion.** `fluidSubmersion.ts` already treats a cell as full when the same fluid is above it, otherwise filled from the bottom to its level. The drawing must follow the same rule so a player sinks where the water looks to be. Share one small helper (e.g. `isCovered(levels, x, y)`) rather than writing it twice.
- **`surfaceAt` callers:** `FluidRenderer.drawnSurfaceY` uses it to place fire flames on the drawn surface. New meaning: the y of the top edge of the fluid drawn in that cell (the average of the two corners), or the cell top when covered. Null for an empty cell.
- **No overlaps and exact shared corners.** Fluids are see-through (opacity < 1). Two shapes overlapping make a darker line, and a gap makes a bright hairline. Corners shared between cells must be the very same number (work out each corner once per layout, e.g. a corner array indexed by `(x, y)` edge, not twice per cell). The existing banding (`fluidBodyBands`, `FLUID_SHADE_STRIPS`) already avoids overlap; keep that idea for depth shading.
- **Depth for shading** is the number of same-fluid cells straight above, plus how far below the surface it is. Work it out once per column per layout and cache it, like `column()` does today.
- **Keep the layout cheap and cacheable.** `FluidRenderer.markAround` sets `this.layout = null` on any change, so the whole layout is rebuilt lazily. Per-cell geometry only needs a cell's 8 neighbours, so `markAround` can shrink to the cell and its neighbours (no more scanning up and down the column for streams). Update its comment.
- **The solid sampler is still needed** (to tell a wall from air for corners) and is the same `isTileSolid` the server uses. Without a sampler (some tests), treat out-of-grid as solid and empty cells as air.
- **Exports:** `fallHurry`, `freeFallShare` and the `STREAM_*`/`BLOB_*`/`SPILL_*` constants are exported from `packages/shared/src/index.ts` and imported by `FluidRenderer.ts` and the admin `FluidPreview.tsx`. Remove them from all three in the same change, then `npx tsc` in shared and typecheck client and admin (`npx tsc --noEmit -p tsconfig.app.json`).
- `FluidDisplay` stays (easing levels between steps), but `hurry` and the slide go. The falling bit is applied at once, never eased.
- Replace `fluidShape.test.ts`, `fluidFalls.test.ts` and `fluidPourRegression.test.ts`; trim `fluidDisplay.test.ts` to what remains.

## Implementation notes (2026-10-17)
- **`fluidShape.ts`** is now ~230 lines (was ~750). `FluidLayout(field, tile)` gives one `FluidShape` per cell: whole cell width, `topLeft`/`topRight` = the average of this cell's surface and the same-fluid neighbour's on that side (a neighbour with fluid above it counts as full, via `ownSurface`), `topMid` = the cell's own level, `surface` = nothing of the same fluid above, `falling`, `strength`, `depth` (from the top of the column), wave weights (1 only where the neighbour is also an uncovered, resting surface). The solid sampler and `fallProgress` options are gone: a wall and open air both mean "no fluid there".
- **Lip rule**: implemented by the averaging itself rather than a special case: the top corner of the falling cell at a lip is the average of its own surface and the pool's, so it never rises above the pool (tested: `at the lip of a fall...`). A falling cell is only a full cell tall when the same fluid is above it. A covered neighbour counts as full when averaging, so a pool's edge rises to meet a waterfall.
- **Cover rule** shared with submersion: `fluidCover.ts` `isFluidCovered` (used by `fluidSubmersion` and the layout).
- **Thin falls are fainter, not narrower**: `fallStrength(units) = 0.4 + 0.6 x clamp((units-1)/7)`, multiplied into the fill/highlight alpha by both painters.
- **Deleted**: `ColumnBody`/`StreamSegment`/spill/blob/gap-bridging code, `freeFallShare`, `fallHurry`, `FluidDisplay.hurry`, `FLUID_DISPLAY_FAST_EASE_SECONDS`, the `STREAM_*`/`SPILL_*`/`SUPPORT_*`/`DROP_*`/`JOIN_*` constants, `fluidShape/fluidFalls/fluidPourRegression` tests.
- `surfaceAt` is the average of the two corners (top of the cell when covered): fire flames follow it (`FireRenderer.test.ts` updated).
- **Tests**: `fluidShape.test.ts` (20, includes a property test that neighbouring surfaces always share a corner); scene tests check seams while pouring and once settled. Mutation-checked: corner sharing, the covered-neighbour rule, the lip rule, fall width.

## Follow-up (2026-10-17, owner screenshot: wonky oil mound, oil hovering over water)
- **Oil on water**: a cell holds one fluid, so oil above a partly full water cell hung at the bottom of its own cell with a gap of air above the water. `FluidLayout.lift`: a run of fluid resting on a different fluid that fills only part of its cell is pushed down so it sits directly on that fluid's surface (the whole stack moves together; full, solid, empty or same-fluid below pushes nothing). Volumes stay true (a thin puddle under a thin layer of oil is drawn as two thin layers). Client `markAround` also redraws a stack above a changed cell when it is a different fluid.
- **Wonky surface**: `topMid` was the cell's own level, so each cell was a small tent and slopes and plateau edges looked jagged. It is now halfway between the corners: a straight line across the cell. Corners (shared with neighbours) are unchanged.
- **Scenes added**: `oil-spill` (settles flat in about 100 steps; the simulation was fine, the picture was not) and `oil-on-water` (reproduced the gap; tested every few steps while the water spreads). Oil joins `SCENE_FLUIDS`. Admin preview draws the game's oil in its own colour. Mutation-checked: the lift and the straight-line surface.
- Not changed: submersion still reads cells, not the lifted drawing, so something wading in oil that rests on a thin water layer is slightly off by a fraction of a cell.
