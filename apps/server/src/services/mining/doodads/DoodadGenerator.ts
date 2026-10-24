import {
  BLOCK_SCALE,
  DEFAULT_DOODAD_NEAR_RADIUS,
  MiningTileType,
  doodadRect,
  doodadRectCells,
  doodadSizeChoices,
  doodadSupportCells,
  isTileSolid,
  orderDoodads,
  type BiomeField,
  type DoodadDefinition,
  type DoodadPlacement,
  type DoodadRect,
} from '@mine-me/shared';

/** Salt for the doodads' own random stream, so scenery never changes ore, fluids, gases or mobs. */
export const DOODAD_SEED_SALT = 0x0d00dad5;

/** Chance that a spot where a doodad could stand gets one, for a doodad with weight 1 and density 1 in the biome. */
export const DOODAD_BASE_CHANCE = 0.03;

/** Cells either side of the entrance that stay free of doodads (the same clear zone the ores keep), and how far down it reaches. */
export const DOODAD_ENTRANCE_CLEAR_RADIUS = BLOCK_SCALE;
export const DOODAD_ENTRANCE_CLEAR_ROWS = 2 * BLOCK_SCALE;

/**
 * "Dark only" doodads need a cell this deep (small blocks below the ground): above that, daylight from the entrance and the
 * sky still reaches. The generator has no lighting, so depth stands in for it.
 */
export const DOODAD_DARK_MIN_DEPTH = 4 * BLOCK_SCALE;

interface GridTile {
  type: MiningTileType;
}

export interface DoodadGenerationInput {
  /** The finished map: blocks, pockets, ores, rocks and biome swaps all placed. Row 0 is the ground surface. */
  grid: ReadonlyArray<ReadonlyArray<GridTile>>;
  biomeField: BiomeField;
  doodads: readonly DoodadDefinition[];
  fluidCells: ReadonlyArray<{ x: number; y: number; typeKey: string }>;
  gasCells: ReadonlyArray<{ x: number; y: number; typeKey: string }>;
  /** Seeded random numbers in [0, 1) of the doodads' own stream. */
  rng: () => number;
  /** The most doodads to place. 0 = none. */
  maxCount: number;
  entranceX: number;
  /** The block key of a tile type (e.g. 'DIRT'), for the "sits on these blocks" rule. */
  blockKeyOf: (type: MiningTileType) => string | undefined;
}

/** A doodad that could stand somewhere, before the ones that overlap are weeded out. */
interface Proposal {
  typeIndex: number;
  placement: DoodadPlacement;
  rect: DoodadRect;
}

/** The gap between two rectangles in cells (0 when they touch or overlap), by the larger of the two axis gaps. */
const gapBetween = (a: DoodadRect, b: DoodadRect): number => {
  const gx = Math.max(0, Math.max(a.x - (b.x + b.width), b.x - (a.x + a.width)));
  const gy = Math.max(0, Math.max(a.y - (b.y + b.height), b.y - (a.y + a.height)));
  return Math.max(gx, gy);
};

/** Marks every cell within `radius` (a square) of one of `sources`, so "is something near here" is one lookup. */
function dilate(sources: ReadonlyArray<{ x: number; y: number }>, radius: number, width: number, height: number): Uint8Array {
  const mask = new Uint8Array(width * height);
  for (const { x, y } of sources) {
    for (let dy = -radius; dy <= radius; dy++) {
      const ny = y + dy;
      if (ny < 0 || ny >= height) continue;
      for (let dx = -radius; dx <= radius; dx++) {
        const nx = x + dx;
        if (nx >= 0 && nx < width) mask[ny * width + nx] = 1;
      }
    }
  }
  return mask;
}

/**
 * Decides where the scenery goes (ticket 100). Deterministic for a seed: the same map, doodads and random stream always
 * give the same placements, and the stream is the doodads' own.
 *
 * For every doodad with a biome link, every open cell it could start at is rolled against its chance there (the
 * biome mix of the link's `weight` x `density` times a base rate); a roll that wins picks a size by weight and (for a wall
 * doodad) a side, and is kept only if the whole footprint is open air and the anchor edge is fully supported by blocks the
 * doodad may sit on. The winners are then shuffled and taken in turn, skipping any that overlap one already taken or
 * crowd one of their own kind, until `maxCount` is reached - so the cap never favours the top of the map.
 */
export function generateDoodadPlacements(input: DoodadGenerationInput): DoodadPlacement[] {
  const { grid, biomeField, rng, maxCount } = input;
  const ordered = orderDoodads(input.doodads);
  const height = grid.length;
  const width = grid[0]?.length ?? 0;
  if (ordered.length === 0 || maxCount <= 0 || width === 0) return [];

  const inBounds = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height;
  const isOpen = (x: number, y: number) => inBounds(x, y) && grid[y][x].type === MiningTileType.EMPTY;
  const isSolid = (x: number, y: number) => inBounds(x, y) && isTileSolid(grid[y][x].type);

  const fluidCells = new Set<number>();
  for (const c of input.fluidCells) fluidCells.add(c.y * width + c.x);

  // The biome share of every cell, once (the field answers per cell and allocates)
  const biomeKeys = biomeField.biomes.map((b) => b.key);
  const shareAt = (x: number, y: number) => biomeField.weightsAt(x, y);

  const nearMasks = new Map<string, Uint8Array>();
  const nearMask = (kind: 'fluid' | 'gas', key: string, radius: number): Uint8Array => {
    const id = `${kind}:${key}:${radius}`;
    let mask = nearMasks.get(id);
    if (!mask) {
      const sources = (kind === 'fluid' ? input.fluidCells : input.gasCells).filter((c) => c.typeKey === key);
      mask = dilate(sources, radius, width, height);
      nearMasks.set(id, mask);
    }
    return mask;
  };

  const proposals: Proposal[] = [];

  ordered.forEach((doodad, typeIndex) => {
    // Per biome of the field: [weight, density] of this doodad's link (0 for a biome it is not in)
    const links = biomeKeys.map((key) => {
      const link = doodad.biomes.find((l) => l.biomeKey === key);
      return link ? { weight: link.weight, density: link.density } : { weight: 0, density: 0 };
    });
    if (!links.some((l) => l.weight > 0 && l.density > 0)) return;

    const rules = doodad.spawn ?? {};
    const choices = doodadSizeChoices(doodad);
    const totalChoiceWeight = choices.reduce((sum, c) => sum + c.weight, 0);
    const allowedBlocks = rules.blocks && rules.blocks.length > 0 ? new Set(rules.blocks) : null;
    const nearRadius = rules.nearRadius ?? DEFAULT_DOODAD_NEAR_RADIUS;
    const masks: Uint8Array[] = [
      ...(rules.nearFluids ?? []).map((key) => nearMask('fluid', key, nearRadius)),
      ...(rules.nearGases ?? []).map((key) => nearMask('gas', key, nearRadius)),
    ];
    const needsNear = (rules.nearFluids?.length ?? 0) + (rules.nearGases?.length ?? 0) > 0;
    const minRow = Math.max(1, rules.minDepth ?? 1, rules.darkOnly ? DOODAD_DARK_MIN_DEPTH : 0);
    const maxRow = Math.min(height - 1, rules.maxDepth ?? height - 1);

    const pickChoice = (): number => {
      let roll = rng() * totalChoiceWeight;
      for (let i = 0; i < choices.length; i++) {
        roll -= choices[i].weight;
        if (roll < 0) return i;
      }
      return choices.length - 1;
    };

    for (let y = minRow; y <= maxRow; y++) {
      for (let x = 0; x < width; x++) {
        if (!isOpen(x, y) || fluidCells.has(y * width + x)) continue;
        // The biome mix of this doodad's link at the cell
        const shares = shareAt(x, y);
        let weight = 0;
        let density = 0;
        for (let i = 0; i < shares.length; i++) {
          weight += shares[i] * links[i].weight;
          density += shares[i] * links[i].density;
        }
        const chance = DOODAD_BASE_CHANCE * weight * density;
        if (chance <= 0 || rng() >= chance) continue;

        const variant = pickChoice();
        const flip = doodad.anchor === 'WALL' && rng() < 0.5;
        const placement: DoodadPlacement = { typeIndex, x, y, variant, flip };
        const rect = doodadRect(doodad, placement);
        if (rect.y + rect.height - 1 > maxRow) continue;
        if (!fits(doodad, placement, rect)) continue;
        if (needsNear && !masks.some((mask) => doodadRectCells(rect).some((c) => mask[c.y * width + c.x] === 1))) continue;
        proposals.push({ typeIndex, placement, rect });
      }
    }

    function fits(def: DoodadDefinition, placement: DoodadPlacement, rect: DoodadRect): boolean {
      // Entrance zone stays clear
      if (rect.y <= DOODAD_ENTRANCE_CLEAR_ROWS && rect.x <= input.entranceX + DOODAD_ENTRANCE_CLEAR_RADIUS && rect.x + rect.width - 1 >= input.entranceX - DOODAD_ENTRANCE_CLEAR_RADIUS) return false;
      // The whole footprint is open air, and not under fluid
      for (const c of doodadRectCells(rect)) {
        if (!isOpen(c.x, c.y) || fluidCells.has(c.y * width + c.x)) return false;
      }
      if (def.anchor === 'AIR') {
        // Free-floating: not touching any block, corners included
        for (let dy = -1; dy <= rect.height; dy++) for (let dx = -1; dx <= rect.width; dx++) if (isSolid(rect.x + dx, rect.y + dy)) return false;
        return true;
      }
      // Hung on or standing on blocks along the whole anchor edge, each of a kind it may sit on
      for (const c of doodadSupportCells(def.anchor, rect, placement.flip)) {
        if (!isSolid(c.x, c.y)) return false;
        if (allowedBlocks) {
          const key = input.blockKeyOf(grid[c.y][c.x].type);
          if (!key || !allowedBlocks.has(key)) return false;
        }
      }
      return true;
    }
  });

  // Take them in a random order, so neither the map's top-left nor the first doodad by key wins every overlap
  for (let i = proposals.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [proposals[i], proposals[j]] = [proposals[j], proposals[i]];
  }

  const taken: Proposal[] = [];
  const takenByType = new Map<number, DoodadRect[]>();
  const occupied = new Uint8Array(width * height);
  for (const proposal of proposals) {
    if (taken.length >= maxCount) break;
    const { rect, typeIndex } = proposal;
    if (doodadRectCells(rect).some((c) => occupied[c.y * width + c.x] === 1)) continue;
    const spacing = ordered[typeIndex].spawn?.minSpacing ?? 0;
    if (spacing > 0 && (takenByType.get(typeIndex) ?? []).some((other) => gapBetween(rect, other) < spacing)) continue;
    for (const c of doodadRectCells(rect)) occupied[c.y * width + c.x] = 1;
    taken.push(proposal);
    const list = takenByType.get(typeIndex) ?? [];
    list.push(rect);
    takenByType.set(typeIndex, list);
  }

  // Row by row, so the result does not depend on the shuffle
  return taken
    .map((p) => p.placement)
    .sort((a, b) => a.y - b.y || a.x - b.x);
}
