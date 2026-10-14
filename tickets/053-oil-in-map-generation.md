# 053 - Oil pockets in map generation

**Priority:** P2 - **Status:** Done (2026-10-13) - **Depends on:** 051, 052

## Decisions (Q&A 2026-10-13)
- Oil spawns as **full-level square pockets sealed in rock**, at depth ranges. Digging into one releases it.
- Per-fluid generation config in the admin (min/max depth, frequency, pocket size range), like ore generation. No hard-coded depths.

## Scope
- Fluid generation fields (on `Fluid` or a shared generation config, to be chosen by looking at how ore generation is stored today), generator change in `MiningWorld`, seeded RNG so worlds are reproducible.
- Pockets must not overlap structures/ore badly and must be enclosed (or at least not spill at generation time; a settle pass at start is a fallback).

## Tests
Seeded generation places pockets only within depth range, respects frequency bounds, pockets are sealed, same seed same map.

## Decisions (made on the owner's instruction to keep going; flag if wrong)
- **Settings live on the fluid**, as one Json column `Fluid.generation` (shared `FluidGeneration`: `minDepth`, `maxDepth` (null = bottom), `percentage` of diggable tiles in the range, `minSize`/`maxSize` pocket side). No map-config columns per fluid. Null = never generated. Validated by the shared `validateFluid`.
- **Pockets are squares of full cells carved from plain dirt only** (never replacing ore, rock, chests or caves), with a one-tile solid ring, so they are always sealed and never open onto a cavern or tunnel.
- **Placed before ores, rocks and chests**, because afterwards plain dirt with a clean ring is too scarce (tried last first: about 1 pocket per 200 attempts). Later steps leave pockets alone: ores only replace dirt, a rock needs solid ground beneath it (so none sits over a pocket), chests skip pocket cells.
- **Own random stream** (`seed ^ salt`). A map with no generating fluid is byte-identical to before (tested), so existing seeds are unchanged.
- **Mobs never spawn inside a pocket** (cavern spawn skips cells holding fluid).
- Oil defaults: depth 8 and down, 1.5% of diggable tiles, pockets 2 to 4 wide. Tunable in the admin (060).
- The admin map preview (`miningConfig.controller`) still uses the plain generator, so it does not show pockets.

## Implementation notes
- Schema `Fluid.generation Json?` (additive `db push`, applied); shared `FluidGeneration` + `validateFluidGeneration`; `fluids.json` Oil gets generation.
- `MiningMapGenerator.placeFluidPockets`, `generateMiningMapWithFluids` (grid + `fluidCells`); `MiningGameEngine` passes the loaded fluids and places the cells into the fluid grid (still sealed, so nothing flows at the start).
- `prisma/add-oil-fluid.ts` now also gives an existing Oil its generation settings when it has none (dry run says "will get its generation settings"). **Applied** (owner confirmed 2026-10-14; not re-checked against the DB).
- **Tests:** generator (10: pockets are full open cells, depth range, square sizes, sealed, nothing inside/over, reproducible, nothing without settings, more with a higher percentage, edges) and engine (pockets start still, no mob spawns inside); shared validator tests. Mutation-checked: the chest guard, the mob guard and the solid-ring rule each fail a test.
- Pre-existing flaky test noticed: `MiningGameEngine.drops.test.ts` "sends the list when items spawn..." fails about 1 run in 12 on the tree without any fluid changes too. Not touched here.
