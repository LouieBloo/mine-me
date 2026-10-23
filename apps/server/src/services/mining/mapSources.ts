import { DEFAULT_SKY_ROWS, MiningTileType, type FluidDefinition, GasDefinition, MiningGameMode, MiningMapConfigData } from '@mine-me/shared';
import { generateMiningMapWithFluids, type GeneratedFluidCell, type GeneratedGasCell, type ServerMiningGrid } from '../miningMap.service';
import { BLOCK_TILE_TYPES } from './subsystems/MiningDataManager';
import { createDefaultSandboxLayout, type SandboxMobSpawn } from './sandbox/SandboxLayout';
import { buildSandboxMap } from './sandbox/SandboxMapBuilder';

/** A room's starting map. */
export interface BuiltMap {
  grid: ServerMiningGrid;
  fluidCells: GeneratedFluidCell[];
  /** Gas the map starts with. Absent means none. */
  gasCells?: GeneratedGasCell[];
  /**
   * Mobs the map starts with. Absent means "the usual": cavern mobs by the map config plus the
   * surface dummy (the generated mine). Present (even if empty) replaces that.
   */
  mobs?: readonly SandboxMobSpawn[];
  /** Row of the ground surface (default 0). Sky above it is open air players can be in. */
  surfaceRow?: number;
}

export interface MapSourceOptions {
  seed: number;
  mapConfig?: Partial<MiningMapConfigData>;
  fluids: readonly FluidDefinition[];
  gases?: readonly GasDefinition[];
}

/** Builds the starting map for a mode: the sandbox from its layout, every other mode from the generator. */
export function buildMapForMode(mode: MiningGameMode, options: MapSourceOptions): BuiltMap {
  if (mode === 'sandbox') {
    return buildSandboxMap(createDefaultSandboxLayout(BLOCK_TILE_TYPES), options.fluids, options.gases);
  }
  const generated = generateMiningMapWithFluids({ seed: options.seed, config: options.mapConfig, fluids: options.fluids, gases: options.gases });
  return addSkyRows(generated, options.mapConfig?.skyRows ?? DEFAULT_SKY_ROWS);
}

/**
 * Puts `skyRows` rows of open air on top of a generated map. The generator and everything it measures (depth bands,
 * entrance zone) work from the ground row, so the map is built as before and then shifted down: the old row 0 (the
 * ground surface) becomes `surfaceRow`, and every fluid, gas and mob position moves with it. Sky is empty and already
 * revealed (it is open air, there is nothing to uncover).
 */
export function addSkyRows(map: BuiltMap, skyRows: number): BuiltMap {
  const rows = Math.max(0, Math.floor(skyRows));
  if (rows === 0) return { ...map, surfaceRow: map.surfaceRow ?? 0 };
  const width = map.grid[0]?.length ?? 0;
  const sky = Array.from({ length: rows }, () => Array.from({ length: width }, () => ({ type: MiningTileType.EMPTY, revealed: true })));
  return {
    ...map,
    grid: [...sky, ...map.grid],
    fluidCells: map.fluidCells.map((cell) => ({ ...cell, y: cell.y + rows })),
    gasCells: map.gasCells?.map((cell) => ({ ...cell, y: cell.y + rows })),
    mobs: map.mobs?.map((mob) => ({ ...mob, y: mob.y + rows })),
    surfaceRow: (map.surfaceRow ?? 0) + rows,
  };
}
