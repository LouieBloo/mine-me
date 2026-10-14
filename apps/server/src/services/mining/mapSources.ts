import type { FluidDefinition, MiningGameMode, MiningMapConfigData } from '@mine-me/shared';
import { generateMiningMapWithFluids, type GeneratedFluidCell, type ServerMiningGrid } from '../miningMap.service';
import { BLOCK_TILE_TYPES } from './subsystems/MiningDataManager';
import { createDefaultSandboxLayout, type SandboxMobSpawn } from './sandbox/SandboxLayout';
import { buildSandboxMap } from './sandbox/SandboxMapBuilder';

/** A room's starting map. */
export interface BuiltMap {
  grid: ServerMiningGrid;
  fluidCells: GeneratedFluidCell[];
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
}

/** Builds the starting map for a mode: the sandbox from its layout, every other mode from the generator. */
export function buildMapForMode(mode: MiningGameMode, options: MapSourceOptions): BuiltMap {
  if (mode === 'sandbox') {
    return buildSandboxMap(createDefaultSandboxLayout(BLOCK_TILE_TYPES), options.fluids);
  }
  return generateMiningMapWithFluids({ seed: options.seed, config: options.mapConfig, fluids: options.fluids });
}
