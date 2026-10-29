import {
  BLOCK_SCALE,
  MiningTileType,
  doodadRect,
  doodadRectCells,
  doodadSizeChoices,
  doodadSupportCells,
  isTileSolid,
  orderDoodads,
  type DoodadDefinition,
  type DoodadPlacement,
  type SurfaceEnvironmentDefinition,
} from '@mine-me/shared';

/** Salt for the surface props' own random stream, so they never change the underground scenery, ore, fluids or mobs. */
export const SURFACE_PROPS_SEED_SALT = 0x5f4c3a29;

/** Columns either side of the entrance that stay free of surface props (the exit sign and its spot). */
export const SURFACE_ENTRANCE_CLEAR_RADIUS = 3 * BLOCK_SCALE;
/** Columns kept clear either side of the extractor's landing pad. */
export const SURFACE_EXTRACTOR_MARGIN = BLOCK_SCALE;
/** Birds in a flock, and how far apart they sit. */
const FLOCK_MIN = 2;
const FLOCK_MAX = 4;
const FLOCK_SPREAD_X = 5;
const FLOCK_SPREAD_Y = 3;
/** How many random tries each prop gets per thing it should place before it gives up on a crowded surface. */
const TRIES_PER_PLACEMENT = 12;

interface GridTile {
  type: MiningTileType;
}

export interface SurfacePropsInput {
  /** The finished map with its sky rows on top. */
  grid: ReadonlyArray<ReadonlyArray<GridTile>>;
  /** First ground row (the sky is above it). */
  surfaceRow: number;
  environment: Pick<SurfaceEnvironmentDefinition, 'props'>;
  doodads: readonly DoodadDefinition[];
  /** Seeded random numbers in [0, 1) of the surface props' own stream. */
  rng: () => number;
  entranceX: number;
  /** Column ranges (inclusive) that stay clear, e.g. the extractor's pad. */
  avoid?: ReadonlyArray<{ x0: number; x1: number }>;
  /** The block key of a tile type, for a doodad that may only stand on some blocks. */
  blockKeyOf: (type: MiningTileType) => string | undefined;
}

/**
 * Places the environment's props on the surface (ticket 135): trees and bushes (floor doodads) stand on the ground row,
 * birds (air doodads) fly in the sky in loose flocks. It reuses the doodad system: the result is ordinary doodad
 * placements, shown, swayed, hurt and removed like any other. Deterministic for a seed and never touches the entrance or
 * the extractor's pad. Ceiling and wall doodads are not surface props and are ignored.
 */
export function generateSurfaceProps(input: SurfacePropsInput): DoodadPlacement[] {
  const { grid, surfaceRow, rng } = input;
  const props = input.environment.props ?? [];
  const width = grid[0]?.length ?? 0;
  if (props.length === 0 || width === 0 || surfaceRow <= 0) return [];
  const ordered = orderDoodads(input.doodads);
  const occupied = new Set<number>();
  const placements: DoodadPlacement[] = [];
  const isSolid = (x: number, y: number) => y >= 0 && y < grid.length && x >= 0 && x < width && isTileSolid(grid[y][x].type);

  const blocked = (x0: number, x1: number): boolean => {
    if (x1 >= input.entranceX - SURFACE_ENTRANCE_CLEAR_RADIUS && x0 <= input.entranceX + SURFACE_ENTRANCE_CLEAR_RADIUS) return true;
    return (input.avoid ?? []).some((a) => x1 >= a.x0 - SURFACE_EXTRACTOR_MARGIN && x0 <= a.x1 + SURFACE_EXTRACTOR_MARGIN);
  };

  // Spacing is kept between props of the same kind: the cells they and their gap cover
  const spaced = new Map<number, number[]>();

  for (const prop of props) {
    const typeIndex = ordered.findIndex((d) => d.key === prop.doodadKey);
    if (typeIndex < 0) continue;
    const doodad = ordered[typeIndex];
    if (doodad.anchor !== 'FLOOR' && doodad.anchor !== 'AIR') continue;
    const choices = doodadSizeChoices(doodad);
    const total = choices.reduce((sum, c) => sum + c.weight, 0);
    const pickVariant = (): number => {
      let roll = rng() * total;
      for (let i = 0; i < choices.length; i++) {
        roll -= choices[i].weight;
        if (roll < 0) return i;
      }
      return choices.length - 1;
    };
    const allowedBlocks = doodad.spawn?.blocks && doodad.spawn.blocks.length > 0 ? new Set(doodad.spawn.blocks) : null;
    const spacing = Math.max(0, prop.spacing ?? 0);
    const kept = spaced.get(typeIndex) ?? [];
    spaced.set(typeIndex, kept);

    /** Tries to put one at (x, y); true when it stands. */
    const tryPlace = (x: number, y: number, variant: number): boolean => {
      const placement: DoodadPlacement = { typeIndex, x, y, variant, flip: false };
      const rect = doodadRect(doodad, placement);
      if (rect.x < 0 || rect.y < 0 || rect.x + rect.width > width || rect.y + rect.height > surfaceRow) return false;
      if (blocked(rect.x, rect.x + rect.width - 1)) return false;
      const cells = doodadRectCells(rect);
      if (cells.some((c) => occupied.has(c.y * width + c.x) || isSolid(c.x, c.y))) return false;
      if (spacing > 0 && kept.some((otherX) => Math.abs(otherX - rect.x) < rect.width + spacing)) return false;
      if (doodad.anchor === 'FLOOR') {
        for (const c of doodadSupportCells('FLOOR', rect, false)) {
          if (!isSolid(c.x, c.y)) return false;
          if (allowedBlocks) {
            const key = input.blockKeyOf(grid[c.y][c.x].type);
            if (!key || !allowedBlocks.has(key)) return false;
          }
        }
      }
      for (const c of cells) occupied.add(c.y * width + c.x);
      kept.push(rect.x);
      placements.push(placement);
      return true;
    };

    const wanted = Math.max(0, (prop.density * width) / 100);
    // The fraction is a chance of one more, so a low density still shows up on some maps
    const count = Math.floor(wanted) + (rng() < wanted - Math.floor(wanted) ? 1 : 0);

    if (doodad.anchor === 'FLOOR') {
      for (let n = 0; n < count; n++) {
        for (let attempt = 0; attempt < TRIES_PER_PLACEMENT; attempt++) {
          const variant = pickVariant();
          const size = doodadRect(doodad, { x: 0, y: 0, variant });
          const x = Math.floor(rng() * Math.max(1, width - size.width));
          if (tryPlace(x, surfaceRow - size.height, variant)) break;
        }
      }
    } else {
      const low = Math.max(0, prop.minHeight ?? 6 * BLOCK_SCALE);
      const high = Math.max(low, prop.maxHeight ?? 18 * BLOCK_SCALE);
      for (let n = 0; n < count; n++) {
        const centreX = Math.floor(rng() * width);
        const centreHeight = low + rng() * (high - low);
        const birds = FLOCK_MIN + Math.floor(rng() * (FLOCK_MAX - FLOCK_MIN + 1));
        for (let b = 0; b < birds; b++) {
          for (let attempt = 0; attempt < TRIES_PER_PLACEMENT; attempt++) {
            const variant = pickVariant();
            const size = doodadRect(doodad, { x: 0, y: 0, variant });
            const x = Math.round(centreX + (rng() * 2 - 1) * FLOCK_SPREAD_X);
            const height = Math.min(high, Math.max(low, centreHeight + (rng() * 2 - 1) * FLOCK_SPREAD_Y));
            if (tryPlace(x, Math.round(surfaceRow - height - size.height), variant)) break;
          }
        }
      }
    }
  }
  return placements.sort((a, b) => a.y - b.y || a.x - b.x);
}
