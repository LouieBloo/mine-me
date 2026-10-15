# 068 - Gas pockets in map generation

**Priority:** P2 - **Status:** Done (2026-10-14); gases get pockets once the data script is applied - **Depends on:** 066, 067 (pattern: 053)

## Problem
Gas must spawn in pockets in generated mines, configured in the Mine Generator admin page, exactly like fluids.

## Design
- Shared `GasGeneration` shape (mirrors `FluidGeneration`): frequency/pockets per map, min/max pocket size, depth range, which cavern/tunnel cells qualify, initial concentration. Stored in `Gas.generation`; null = never generated.
- Map generation places pockets through `MiningGasSubsystem.placeGas(x, y, typeKey, amount)` (the gas twin of `placeFluid`), using the same `mapSources` path fluids use. Pockets start in sealed or semi-sealed cavities so they are discovered by digging in. Generation never places gas in a cell that holds fluid.
- Admin: like fluids, the settings are edited on the gas's own detail page (a `GasGenerationPanel`, built in 071); there are no map-config columns. The per-gas data lives in `Gas.generation`.
- Generation is deterministic for a seed, like fluids.

## Tests
Pockets appear in the configured count and size ranges; none for gases with null generation; none inside solid or fluid cells; same seed gives the same map; admin panel validates and saves; server `miningMap.gases.test.ts` alongside `miningMap.fluids.test.ts`. Mutation-check: ignore the frequency field, confirm a test fails.

## Implementation notes
- **Generator:** `MiningMapGenerator.placeGasPockets` runs right after the fluid pockets and before ores, rocks and chests. Fluid and gas pockets now share one private `carvePockets` (same rules as 053: plain dirt only, a solid one-tile ring, so every pocket is sealed). Gas has its own random stream (`seed ^ GAS_SEED_SALT`), so adding gas never moves a fluid pocket (tested) and a map with no generating gas is byte-identical to before (tested). Definitions are applied in typeKey order, so the database's row order does not matter. One `pocketCellKeys` set covers both so chests skip them.
- **API:** `generateMiningMapWithFluids` now also returns `gasCells` (`{x, y, typeKey, concentration}`); `MapGeneratorOptions.gases`; `BuiltMap.gasCells` (optional; the sandbox has none until 072). The engine places the cells with `MiningGasSubsystem.placeGas`. The shared `GasGeneration` shape is unchanged from 066 (`concentration` optional, default 1).
- **Mobs** never spawn inside a gas pocket (cavern spawn skips cells holding gas).
- **Side effect to know about:** the seed mirror gives hydrogen and nitrogen generation settings (3% of diggable dirt each, pockets 2 to 4 wide, hydrogen from row 3, nitrogen from row 2), so every new mine has gas pockets once the dev DB has the two gases (the data script is not applied yet). Tests that build a room from the default definitions now start with generated pockets; the gas engine tests clear them first.
- **Tests:** `miningMap.gases.test.ts` (14) and three engine tests (pockets start still, gas and fluid apart, no mob inside). Mutation-checked: skipping the engine placement, the mob guard and the pocket-key tracking each fail a test.
- **Not done here:** the admin panel (071), a settle pass (pockets are sealed so none is needed).
