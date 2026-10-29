import { DEFAULT_SKY_ROWS, MINING_CONFIG, MiningTileType, placeExtractor, type ExtractorDefinition, type SurfaceEnvironmentDefinition, type BiomeDefinition, type BiomeField, type DoodadDefinition, type DoodadPlacement, type FluidDefinition, GasDefinition, MiningGameMode, MiningMapConfigData, type MissionRequirements, hasRequirements } from '@mine-me/shared';
import { generateMiningMapWithFluids, type GeneratedFluidCell, type GeneratedGasCell, type ServerMiningGrid } from '../miningMap.service';
import { BLOCK_TILE_TYPES, blockKeyForTileType } from './subsystems/MiningDataManager';
import { createSeededRng } from '../miningMap.service';
import { SURFACE_PROPS_SEED_SALT, generateSurfaceProps } from './doodads/SurfaceProps';
import { createDefaultSandboxLayout, type SandboxMobSpawn } from './sandbox/SandboxLayout';
import { buildSandboxMap } from './sandbox/SandboxMapBuilder';
import { mapShortfall } from './missions/missionCensus';
import { generateSandboxDoodads } from './sandbox/sandboxDoodads';

/** A room's starting map. */
/** How many other seeds a map is regenerated with when it still lacks what the mission needs. */
export const MISSION_MAP_RETRIES = 5;

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
  /** Which biome each cell is in. Absent: every cell is the default. The sandbox lays its biomes out in bands. Queries use rows of the whole map, sky included. */
  biomeField?: BiomeField;
  /** Where the doodads stand (rows of the whole map, sky included). Absent: none; the sandbox places them by hand. */
  doodads?: DoodadPlacement[];
  /** Row of the ground surface (default 0). Sky above it is open air players can be in. */
  surfaceRow?: number;
}

export interface MapSourceOptions {
  seed: number;
  mapConfig?: Partial<MiningMapConfigData>;
  fluids: readonly FluidDefinition[];
  gases?: readonly GasDefinition[];
  biomes?: readonly BiomeDefinition[];
  doodads?: readonly DoodadDefinition[];
  /** What the run's mission needs from the map (ticket 110). Absent: a map with no mission, generated exactly as before. */
  mission?: MissionRequirements;
  /** Sandbox only: run the generator's doodad pass on the hand-built map (off by default, ticket 107). */
  sandboxDoodads?: boolean;
  /** The surface the run has (ticket 135): its props are placed on the ground. Absent: no surface props. */
  surface?: {
    environment: Pick<SurfaceEnvironmentDefinition, 'props'>;
    /** The extractor that will land on the surface: its pad stays clear of props. */
    extractor?: Pick<ExtractorDefinition, 'width' | 'height' | 'entranceOffset' | 'shaftWidth'> | null;
  };
}

/** The surface props of an environment as doodad placements on a finished map (rows of the whole map, sky included). */
function surfacePropsFor(map: BuiltMap, options: MapSourceOptions): DoodadPlacement[] {
  if (!options.surface || !options.doodads?.length) return [];
  const surfaceRow = map.surfaceRow ?? 0;
  const pad = options.surface.extractor ? placeExtractor(options.surface.extractor, surfaceRow, map.grid[0]?.length ?? 0) : null;
  return generateSurfaceProps({
    grid: map.grid,
    surfaceRow,
    environment: options.surface.environment,
    doodads: options.doodads,
    rng: createSeededRng(options.seed ^ SURFACE_PROPS_SEED_SALT),
    entranceX: MINING_CONFIG.ENTRANCE_X,
    avoid: pad ? [{ x0: pad.x, x1: pad.x + pad.width - 1 }] : [],
    blockKeyOf: (type) => blockKeyForTileType(type),
  });
}

const withSurfaceProps = (map: BuiltMap, options: MapSourceOptions): BuiltMap => {
  const props = surfacePropsFor(map, options);
  return props.length === 0 ? map : { ...map, doodads: [...(map.doodads ?? []), ...props] };
};

/** Builds the starting map for a mode: the sandbox from its layout, every other mode from the generator. */
export function buildMapForMode(mode: MiningGameMode, options: MapSourceOptions): BuiltMap {
  if (mode === 'sandbox') {
    const map = buildSandboxMap(createDefaultSandboxLayout(BLOCK_TILE_TYPES), options.fluids, options.gases, options.biomes);
    if (!options.sandboxDoodads || !options.doodads?.length) return map;
    return withSurfaceProps({ ...map, doodads: generateSandboxDoodads(map, { seed: options.seed, doodads: options.doodads, biomes: options.biomes, maxCount: options.mapConfig?.doodadMaxCount }) }, options);
  }
  const mission = options.mission && hasRequirements(options.mission) ? options.mission : undefined;
  const generate = (seed: number) =>
    generateMiningMapWithFluids({ seed, config: options.mapConfig, fluids: options.fluids, gases: options.gases, biomes: options.biomes, doodads: options.doodads, mission });
  let generated = generate(options.seed);
  // The generator tops up what the mission needs; if a crowded map still falls short, the next derived seed is tried
  for (let attempt = 1; mission && attempt <= MISSION_MAP_RETRIES && mapShortfall(mission, generated).length > 0; attempt++) generated = generate(options.seed + attempt * 7919);
  return withSurfaceProps(addSkyRows(generated, options.mapConfig?.skyRows ?? DEFAULT_SKY_ROWS), options);
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
    biomeField: map.biomeField?.shiftRows(rows),
    doodads: map.doodads?.map((d) => ({ ...d, y: d.y + rows })),
    surfaceRow: (map.surfaceRow ?? 0) + rows,
  };
}
