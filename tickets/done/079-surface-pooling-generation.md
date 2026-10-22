# 079 - Water pooling on surfaces and deep lava in map generation

**Priority:** P2 - **Status:** Done (2026-10-16); pool data applied - **Part of:** water + lava epic (074-080) - **Depends on:** 053, 078

## Problem
`FluidGeneration` only makes sealed square pockets inside dirt (oil). Water must also **pool on surfaces at any depth** (puddles that lie on cave floors and fill hollows), and lava must appear **only in the lower depths**.

## Decisions (Q&A 2026-10-16)
- Lava: the existing pocket generation, `minDepth` deep only (starting value ~15), small percentage.
- Water: a new generation `mode: 'POOL'` on `FluidGeneration` (default stays `'POCKET'` so oil is unchanged). Pools are placed on the floor of existing open cavities: a solid floor tile with open space above it; fill a shallow layer that settles with the fluid sim. Any depth, a chance per eligible floor, pool width min/max.
- Both are editable in the admin Fluids generation panel (a mode select and the pool fields).
- **Pocket shapes (owner, 2026-10-16):** sealed pockets are no longer only squares. Each pocket is randomly a **square, a rectangle, or a vein** (a wandering, branching blob grown like the ore veins in `placeOreVeins`), so the fluid is more interesting to look at. Rule for all shapes: **every cell is connected** (4-neighbour flood fill checked, a disconnected result is regrown or discarded) and the pocket stays sealed (solid one-tile ring, same `canHoldPocket` test applied to the shape's cells and ring).
- `FluidGeneration` gets `shapes` (which are allowed, with a weight each: square / rectangle / vein; absent = all three) and the size fields mean "cell count" bounds for veins (`minSize`/`maxSize` stay the side range for squares and rectangles, a rectangle's sides are drawn independently inside it). **Owner decision: all fluids (oil, water, lava) and all gases (hydrogen, nitrogen, later ones) use the new shapes.** No `shapes` setting means the default mix of all three, so existing data needs no migration.
- Gas pockets share `carvePockets`, so the shape work is done once for fluids and gases; `GasGeneration` gets the same `shapes` field, its admin panel (071) the same weights, and gas concentration/venting (067) must be checked against non-square pockets. Same random stream, shape drawn from it, so a seed stays deterministic.
- Admin generation panel: a weight per shape.
- Open question to settle when starting: how much water by default (puddle width/frequency) so mines are not flooded.

## Tests
Every shape (square, rectangle, vein) is one connected sealed region, vein growth is deterministic per seed, pockets never break the ring, shape weights respected. Pools only sit on solid floors, never in sealed dirt, respect the width range and chance, same seed gives the same map, lava never above its min depth, oil still generates as pockets, admin panel.

## Implementation notes
- **Shared:** `PocketShape` (SQUARE / RECTANGLE / VEIN), weights (`shapes`, absent = even mix; listing shapes turns the unlisted ones off), `FluidGeneration.mode` (`POCKET` default / `POOL`), validators (gases take shapes but refuse `POOL`). New pure `gameLogic/pocketShapes.ts`: `generatePocketOutline` (a vein is a random walk with branches that only ever adds a cell touching an existing one, so it is connected by construction and capped within 3x the largest side of where it started), `pickPocketShape`, `isConnected`.
- **Vein size:** `minSize`/`maxSize` draw a side; a vein has side x side cells, so fluid per pocket stays about the same whatever the shape (this replaces the "size is a cell count" wording above).
- **Generator (`miningMap.service.ts`):** `carvePockets` draws a shape per attempt and checks the whole shape (all dirt, every neighbour including corners solid), shared by **all fluids and gases**. `POOL` mode lays one row of full cells along runs of open floor (open tile with solid below) of the drawn width at any depth in range, `percentage` of the eligible floor. Pools use the fluid's own random stream, so oil/lava pockets of a given seed do not change when water is added.
- **Admin:** `PocketShapeWeights` (new shared component) in both generation panels; the fluid panel also gets a "Where it appears" selector (pockets / pools) that relabels the size and hides shapes for pools.
- **Data:** `prisma/add-pool-generation.ts` (dry run by default; **applied**) gave Water `{ mode: POOL, minDepth 2, percentage 6, width 3-6 }`. Oil, hydrogen and nitrogen need no change (even mix by default). Defaults are a first guess: tune puddle frequency in the Fluids admin so mines are not flooded.
- **Tests:** pocket shapes (13 shared), generator (13: boxes only / veins / default mix, sealed with corners, deterministic, per-fluid shapes, pools on floors / depth range / determinism / 0%, gas veins), panels. Mutation-checked: connectivity of veins, and the sealing check.
- Gas concentration and venting (067) with non-square pockets were not separately re-tested; the gas generation tests pass with veins.
