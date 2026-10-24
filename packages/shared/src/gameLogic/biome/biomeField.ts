import { BUILT_IN_DEFAULT_BIOME, type BiomeDefinition } from '../../types/biome';

/**
 * The biome field (tickets 095-096): which biome each cell belongs to, as a pure function of the seed, the
 * biome definitions and the blend width. Nothing here touches the engine, so it is testable on its own.
 *
 * Each biome is a seeded 2D noise blob scaled by its weight and limited to its depth window. The strongest score
 * at a cell is its *primary* biome. Borders are soft: every biome whose score is within `blendWidth` of the top
 * contributes to the cell, linearly less the further behind it is. Content is then drawn from the *mix* of the
 * contributing biomes' tables (see `mix` and the helpers), so a border has a gradual mixture of both biomes.
 */

/** Default blend width, in noise-score units: 0 is a hard edge, bigger is a wider soft border. */
export const DEFAULT_BIOME_BLEND_WIDTH = 0.15;

/** Rows over which a biome fades in at a depth limit, per unit of blend width. */
const DEPTH_FADE_ROWS_PER_BLEND = 20;

/** Salt that keeps biome noise independent of the generator's other random streams. */
const BIOME_SEED_SALT = 0x0b10e5ed;

/** Hashes a string to a 32-bit number (FNV-1a), so a biome's noise is stable whatever order the biomes load in. */
function hashString(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** A well mixed number in [0, 1) for an integer lattice point. */
function hashCell(seed: number, x: number, y: number): number {
  let h = (seed ^ Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1)) | 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const smooth = (t: number): number => t * t * (3 - 2 * t);

/** Smooth value noise in [0, 1] at (x, y), one lattice cell per unit. */
export function valueNoise(seed: number, x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = smooth(x - x0);
  const fy = smooth(y - y0);
  const top = hashCell(seed, x0, y0) * (1 - fx) + hashCell(seed, x0 + 1, y0) * fx;
  const bottom = hashCell(seed, x0, y0 + 1) * (1 - fx) + hashCell(seed, x0 + 1, y0 + 1) * fx;
  return top * (1 - fy) + bottom * fy;
}

/**
 * The biomes the generator works with: sorted by key (so ties and noise never depend on database order) and with
 * exactly one default. A set with no default gets the built-in one; with several, the first by key stays default.
 */
export function normalizeBiomes(biomes: readonly BiomeDefinition[] | undefined): BiomeDefinition[] {
  const sorted = [...(biomes ?? [])].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const firstDefault = sorted.findIndex((b) => b.isDefault);
  if (firstDefault === -1) {
    return [{ ...BUILT_IN_DEFAULT_BIOME }, ...sorted].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  }
  return sorted.map((b, i) => (b.isDefault && i !== firstDefault ? { ...b, isDefault: false } : b));
}

/**
 * The biomes one map uses. `mapWeights` (biome key -> weight on this map) says which biomes can occur and how strong
 * each is here; a biome's own weight is only the default. Null, absent or empty means every biome at its own weight, so
 * a map that never chose keeps working. The default biome always stays (it fills wherever nothing else wins) and uses
 * its own weight unless the map lists it. Keys that name no biome are ignored.
 */
export function resolveMapBiomes(
  biomes: readonly BiomeDefinition[] | undefined,
  mapWeights: Record<string, number> | null | undefined
): BiomeDefinition[] | undefined {
  if (!biomes || !mapWeights || Object.keys(mapWeights).length === 0) return biomes ? [...biomes] : undefined;
  return biomes
    .filter((b) => b.isDefault || b.key in mapWeights)
    .map((b) => (b.key in mapWeights ? { ...b, weight: mapWeights[b.key] } : b));
}

/** A table lookup that treats a missing key as 1 (unchanged). */
const multiplier = (table: Record<string, number> | null | undefined, key: string): number => table?.[key] ?? 1;

export class BiomeField {
  /** The biomes, sorted by key. A cell's biome is an index into this list. */
  public readonly biomes: readonly BiomeDefinition[];
  public readonly defaultIndex: number;
  private readonly seeds: number[];
  private readonly cache: Float64Array;
  private readonly computed: Uint8Array;
  private readonly depthFadeRows: number;
  private readonly blendWidth: number;
  public readonly width: number;
  /** Rows of the map the biomes were generated for, counted from the ground. */
  public readonly height: number;
  /** Open-air rows added above the ground since: queries take rows of the whole map, so they are shifted back by this. */
  private rowOffset = 0;

  constructor(seed: number, biomes: readonly BiomeDefinition[] | undefined, blendWidth: number, width: number, height: number) {
    this.blendWidth = blendWidth;
    this.width = width;
    this.height = height;
    this.biomes = normalizeBiomes(biomes);
    this.defaultIndex = Math.max(0, this.biomes.findIndex((b) => b.isDefault));
    this.seeds = this.biomes.map((b) => ((seed ^ BIOME_SEED_SALT) + hashString(b.key)) | 0);
    this.cache = new Float64Array(width * height * this.biomes.length);
    this.computed = new Uint8Array(width * height);
    this.depthFadeRows = Math.max(1, Math.round(Math.max(0, blendWidth) * DEPTH_FADE_ROWS_PER_BLEND));
  }

  /** Moves the field down by `rows` (sky added above the ground). Cells in the sky are the default biome. Returns the field. */
  public shiftRows(rows: number): this {
    this.rowOffset += Math.max(0, Math.floor(rows));
    return this;
  }

  /** The number of rows queries may use (the ground rows plus any sky above them). */
  public get totalHeight(): number {
    return this.height + this.rowOffset;
  }

  /** Whether any biome changes how much of a block is placed (otherwise block placement is exactly the old recipe). */
  public get changesBlockWeights(): boolean {
    return this.biomes.some((b) => Object.keys(b.blockPalette?.weights ?? {}).length > 0);
  }

  /** Whether any biome has its own mob spawn list. */
  public get hasMobSpawns(): boolean {
    return this.biomes.some((b) => Object.values(b.mobSpawns ?? {}).some((w) => w > 0));
  }

  /** Whether the map has more than the default biome. When false every cell is the default and nothing is drawn from a mix. */
  public get hasBiomes(): boolean {
    return this.biomes.length > 1;
  }

  /** How much of a biome's strength remains at row `y`: 0 outside its depth window, fading in over a few rows inside it. */
  public depthFactor(biome: BiomeDefinition, y: number): number {
    const max = biome.maxDepth ?? Number.POSITIVE_INFINITY;
    if (y < biome.minDepth || y > max) return 0;
    const inside = Math.min(y - biome.minDepth, max - y) + 1;
    return Math.min(1, inside / this.depthFadeRows);
  }

  /** The raw strength of biome `index` at (x, y): noise x weight x depth window. */
  private score(index: number, x: number, y: number): number {
    const biome = this.biomes[index];
    const depth = this.depthFactor(biome, y);
    if (depth <= 0) return 0;
    const seed = this.seeds[index];
    const s = Math.max(1, biome.noiseScale);
    const noise = 0.7 * valueNoise(seed, x / s, y / s) + 0.3 * valueNoise(seed + 1, (x * 2) / s + 17.3, (y * 2) / s + 9.1);
    return noise * biome.weight * depth;
  }

  private compute(x: number, y: number): void {
    const count = this.biomes.length;
    const base = (y * this.width + x) * count;
    if (count === 1) {
      this.cache[base] = 1;
      return;
    }
    const scores = new Array<number>(count);
    let top = 0;
    for (let i = 0; i < count; i++) {
      scores[i] = this.score(i, x, y);
      if (scores[i] > top) top = scores[i];
    }
    if (top <= 0) {
      this.cache[base + this.defaultIndex] = 1;
      return;
    }
    const blend = Math.max(0, this.blendWidth);
    let total = 0;
    const raw = new Array<number>(count);
    for (let i = 0; i < count; i++) {
      raw[i] = blend > 0 && scores[i] > 0 ? Math.max(0, 1 - (top - scores[i]) / blend) : 0;
      total += raw[i];
    }
    if (blend <= 0) {
      // Hard edges: the first (lowest key) biome with the top score takes the cell
      raw[scores.findIndex((s) => s === top)] = 1;
      total = 1;
    }
    for (let i = 0; i < count; i++) this.cache[base + i] = raw[i] / total;
  }

  private inside(x: number, y: number): boolean {
    return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  /** The share of each biome at the cell (one value per biome, in `biomes` order, adding up to 1). Outside the map: all default. */
  public weightsAt(x: number, mapY: number): readonly number[] {
    const count = this.biomes.length;
    const y = mapY - this.rowOffset;
    if (!this.inside(x, y)) return this.biomes.map((_, i) => (i === this.defaultIndex ? 1 : 0));
    const cell = y * this.width + x;
    if (!this.computed[cell]) {
      this.compute(x, y);
      this.computed[cell] = 1;
    }
    return Array.from(this.cache.subarray(cell * count, cell * count + count));
  }

  /** The strongest biome at the cell (an index into `biomes`; the lowest key wins a tie). */
  public primaryAt(x: number, y: number): number {
    const weights = this.weightsAt(x, y);
    let best = 0;
    for (let i = 1; i < weights.length; i++) if (weights[i] > weights[best]) best = i;
    return best;
  }

  /** The primary biome of every cell of the whole map (sky included), row by row (one byte each). */
  public primaryGrid(): Uint8Array {
    const grid = new Uint8Array(this.width * this.totalHeight);
    for (let y = 0; y < this.totalHeight; y++) for (let x = 0; x < this.width; x++) grid[y * this.width + x] = this.primaryAt(x, y);
    return grid;
  }

  /** The mix of a per-biome number at the cell: each biome's value weighted by its share there. */
  public mix(x: number, y: number, valueOf: (biome: BiomeDefinition) => number): number {
    const weights = this.weightsAt(x, y);
    let sum = 0;
    for (let i = 0; i < weights.length; i++) if (weights[i] > 0) sum += weights[i] * valueOf(this.biomes[i]);
    // Shares add up to 1 only to within float error; round it away so a neutral mix is exactly 1
    return Math.round(sum * 1e9) / 1e9;
  }

  /** The multiplier on how much of a block is placed at the cell. 1 when no biome says otherwise. */
  public blockMultiplier(x: number, y: number, blockKey: string): number {
    return this.mix(x, y, (b) => multiplier(b.blockPalette?.weights, blockKey));
  }

  /** The multiplier on how many pockets of a fluid are made at the cell. */
  public fluidMultiplier(x: number, y: number, fluidKey: string): number {
    return this.mix(x, y, (b) => multiplier(b.fluidWeights, fluidKey));
  }

  /** The multiplier on how many pockets of a gas are made at the cell. */
  public gasMultiplier(x: number, y: number, gasKey: string): number {
    return this.mix(x, y, (b) => multiplier(b.gasWeights, gasKey));
  }

  /**
   * The chance that a `from` block at the cell becomes each other block, from the biomes' swaps weighted by their
   * share. Empty when no biome there swaps `from`. Within one biome the first swap listed for `from` applies.
   */
  public swapChances(x: number, y: number, fromKey: string): { to: string; chance: number }[] {
    const weights = this.weightsAt(x, y);
    const chances = new Map<string, number>();
    for (let i = 0; i < weights.length; i++) {
      if (weights[i] <= 0) continue;
      const swap = this.biomes[i].blockPalette?.swaps?.find((s) => s.from === fromKey);
      if (swap) chances.set(swap.to, (chances.get(swap.to) ?? 0) + weights[i] * (swap.chance ?? 1));
    }
    return [...chances].map(([to, chance]) => ({ to, chance }));
  }

  /**
   * The mobs that may spawn at the cell and how likely each is. A biome with its own spawn list contributes that list
   * (its weights normalised); one without contributes the map's usual list (`fallbackIds`) equally. Empty when nothing applies.
   */
  public mobChoices(x: number, y: number, fallbackIds: readonly string[]): { id: string; weight: number }[] {
    const weights = this.weightsAt(x, y);
    const out = new Map<string, number>();
    for (let i = 0; i < weights.length; i++) {
      if (weights[i] <= 0) continue;
      const table = Object.entries(this.biomes[i].mobSpawns ?? {}).filter(([, w]) => w > 0);
      if (table.length > 0) {
        const total = table.reduce((sum, [, w]) => sum + w, 0);
        for (const [id, w] of table) out.set(id, (out.get(id) ?? 0) + (weights[i] * w) / total);
      } else {
        for (const id of fallbackIds) out.set(id, (out.get(id) ?? 0) + weights[i] / fallbackIds.length);
      }
    }
    return [...out].map(([id, weight]) => ({ id, weight }));
  }
}
