# 054 - Fluid wire format and client rendering

**Priority:** P1 - **Status:** Done (2026-10-13) - **Depends on:** 051, 052

## Decisions
- Full fluid grid once on join (interest-limited if the existing interest system makes that natural), then **per-tick deltas of changed cells**, level quantised (e.g. 0-255). Static fluid definitions sent once with the description (ticket 015 pattern).
- Pixi draws the fluid only (2D graphics); the oil colour/opacity comes from the definition. Partial cells draw as a rectangle of the level's height from the bottom, with a flat surface. Optional smoothing/shimmer later.
- Fluid is lit by the existing lighting; lava-type fluids will emit light from the definition (the hook exists even if oil doesn't use it).
- Preloaded assets must be `/assets/...` URLs.

## Tests
Delta encoding round trip, client applies deltas and full state, stale cells clear (compare ticket 006), renderer draws the right height per level.

## Decisions (made on the owner's instruction to keep going; flag if wrong)
- **Fog of war applies to fluid.** The server only ever sends fluid in cells already revealed (a global per-tile flag), so a client cannot learn where oil hides. A newly revealed tile carries the fluid in it (`revealedTiles[].fluid`); later changes arrive in `fluidCells`; changes to unrevealed cells are dropped and picked up at reveal time.
- **Wire shape:** `fluidCells: [x, y, fluidId, level][]`, level quantised to 1/128 per full cell (a byte covers squeezed cells), only changed cells, every tick they change, to every player in the room (not interest-filtered; the owner chose "do it right, don't over-optimise"). Join snapshot: `MiningSessionClientState.fluids` (definitions, once) and `fluidCells` (revealed cells). Cell ids are the registry's small numbers, not database ids.
- **Drawing:** a client-side `FluidField` (shared, reused by tests) plus `FluidRenderer` (Pixi `Graphics` per 8x8 chunk, only changed chunks redrawn). A cell fills from the bottom to its level, but is drawn full when the same fluid is above it (no gaps in a falling column); the exposed top gets a lighter line. Colour and opacity come from the definition.
- **Layering:** fluid sits above the tiles and **behind every entity** (drops, mobs, players), so things stay visible in it. Flip the container order in `useMiningScene` if "submerged" should hide them; 055 may add a tint instead.
- No new assets, so nothing to preload. Sheen/bubbles for oil are left to 061 (particles and light).

## Implementation notes
- **Shared:** `gameLogic/fluid/fluidWire.ts` (`quantizeFluidLevel`, `toFluidWireCell`, `FluidField`, `FluidClientDefinition`); payload types in `types/mining.ts`. Constructor parameter properties removed from the new shared classes (the client forbids them: `erasableSyntaxOnly`).
- **Server:** `MiningFluidSubsystem.takeVisibleChanges / contentsAt / visibleSnapshot / clientDefinitions`; engine adds `fluid` when revealing and `fluidCells` to each state tick; `buildClientState` adds the definitions and snapshot.
- **Client:** `FluidRenderer`; `useMiningScene` creates it (sized from the grid), applies the join snapshot, destroys it on cleanup; `applyFluidUpdates` in `handleStateTick`; `fluidRendererRef` on the client world.
- **Tests:** shared wire/field (8); server engine wire (6: no fog leaks, changed cells, quiet ticks, reveal carries fluid, join snapshot and definitions, drained cells reported as empty); client renderer layout + chunking (15) and tick handler (5). Mutation-checked: removing the fog filter on changes and on the snapshot, the "covered cell is full" rule, and the apply order (reveal before changes) each fail a test.
- Not covered by an automated test: the Pixi scene hook wiring itself (the existing scene test runs without an app). Checked by typecheck; judged in the game.
