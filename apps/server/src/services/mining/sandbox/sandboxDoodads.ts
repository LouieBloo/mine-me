import {
  BiomeField,
  DEFAULT_DOODAD_MAX_COUNT,
  MINING_CONFIG,
  doodadRect,
  doodadRectCells,
  doodadSupportCells,
  doodadNeedsSupport,
  isTileSolid,
  MiningTileType,
  type BiomeDefinition,
  type DoodadDefinition,
  type DoodadPlacement,
} from '@mine-me/shared';
import { createSeededRng } from '../../miningMap.service';
import { DOODAD_SEED_SALT, generateDoodadPlacements } from '../doodads/DoodadGenerator';
import { blockKeyForTileType } from '../subsystems/MiningDataManager';
import type { SandboxMap } from './SandboxMapBuilder';

export interface SandboxDoodadOptions {
  seed: number;
  doodads: readonly DoodadDefinition[];
  biomes?: readonly BiomeDefinition[];
  /** The most to place (the map config's `doodadMaxCount`). */
  maxCount?: number;
}

/**
 * Runs the generator's doodad pass over the sandbox map (ticket 107), so a doodad bug can be reproduced on a map where
 * the hall, pools and block patches are always the same. The generator measures from the ground row, so it is given the
 * ground rows only and the result is shifted back down; the sandbox's biome bands answer for the biome shares (rows
 * shifted the same way). Returns placements in rows of the whole map (sky included).
 */
export function generateSandboxDoodads(map: SandboxMap, options: SandboxDoodadOptions): DoodadPlacement[] {
  const { surfaceRow } = map;
  const ground = map.grid.slice(surfaceRow);
  const width = map.grid[0]?.length ?? 0;
  const band = map.biomeField;
  const field = band ?? new BiomeField(options.seed, options.biomes, 0, width, ground.length);
  // The generator asks the field for ground rows; the band field is laid out over the whole map, sky included
  const shift = band ? surfaceRow : 0;
  const biomeField = { biomes: field.biomes, weightsAt: (x: number, y: number) => field.weightsAt(x, y + shift) } as unknown as BiomeField;
  const placements = generateDoodadPlacements({
    grid: ground,
    biomeField,
    doodads: options.doodads,
    fluidCells: map.fluidCells.map((c) => ({ x: c.x, y: c.y - surfaceRow, typeKey: c.typeKey })),
    gasCells: map.gasCells.map((c) => ({ x: c.x, y: c.y - surfaceRow, typeKey: c.typeKey })),
    rng: createSeededRng(options.seed ^ DOODAD_SEED_SALT),
    maxCount: options.maxCount ?? DEFAULT_DOODAD_MAX_COUNT,
    entranceX: MINING_CONFIG.ENTRANCE_X,
    blockKeyOf: blockKeyForTileType,
  });
  return placements.map((p) => ({ ...p, y: p.y + surfaceRow }));
}

/** Why a doodad cannot stand here (an open footprint on a solid anchor edge), or null if it can. The sandbox hand tools and scenes share it. */
export function doodadPlacementProblem(
  grid: ReadonlyArray<ReadonlyArray<{ type: MiningTileType }>>,
  doodad: DoodadDefinition,
  placement: DoodadPlacement,
): string | null {
  const height = grid.length;
  const width = grid[0]?.length ?? 0;
  const rect = doodadRect(doodad, placement);
  const cells = doodadRectCells(rect);
  if (cells.some((c) => c.x < 0 || c.y < 0 || c.x >= width || c.y >= height)) return 'That doodad would stick out of the map.';
  if (cells.some((c) => grid[c.y][c.x].type !== MiningTileType.EMPTY)) return 'That doodad needs open space.';
  if (doodadNeedsSupport(doodad.anchor)) {
    const support = doodadSupportCells(doodad.anchor, rect, placement.flip);
    const word = ({ FLOOR: 'a floor to stand on', CEILING: 'a ceiling to hang from', WALL: 'a wall to cling to' } as Record<string, string>)[doodad.anchor] ?? 'something to hold it';
    if (support.some((c) => c.x < 0 || c.y < 0 || c.x >= width || c.y >= height || !isTileSolid(grid[c.y][c.x].type))) return `That doodad needs ${word}.`;
  }
  return null;
}
