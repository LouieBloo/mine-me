/**
 * Biomes (tickets 095-098): named regions of the mine that change the block palette, the fluids and gases, the mob
 * spawns and the ambient look. A biome is a row, like a fluid or a gas; nothing in logic names one.
 */

/** The look and light of a biome. Every field is optional: absent means "the mine's default". */
export interface BiomeAmbient {
  /** CSS hex colour the background wall is tinted with (null/absent: no tint). */
  tint?: string | null;
  /** `/assets/...` texture for the background wall (null/absent: the usual wall). */
  wallTextureUrl?: string | null;
}

/** Turns one kind of block into another across a biome (e.g. dirt into ice). */
export interface BiomeBlockSwap {
  /** Block key of the block that is replaced (e.g. DIRT). */
  from: string;
  /** Block key of the block that takes its place. */
  to: string;
  /** Share of the `from` blocks that are swapped, 0 to 1 (absent: all of them). */
  chance?: number;
}

/** What blocks a biome makes. */
export interface BiomeBlockPalette {
  /** Block key -> multiplier on how much of that block is placed (1 = as usual, 0 = none). Absent keys are 1. */
  weights?: Record<string, number>;
  /** Base-block swaps, applied after everything is placed. */
  swaps?: BiomeBlockSwap[];
}

/** A biome as stored in the database and used by the generator. */
export interface BiomeDefinition {
  id: string;
  /** Open unique key, e.g. 'frozen_caves'. */
  key: string;
  name: string;
  description?: string | null;
  /** The biome used wherever no other fits. There is always exactly one. */
  isDefault: boolean;
  /** First row (0 = ground surface) the biome may appear on, in small blocks. */
  minDepth: number;
  /** Last row it may appear on (null/absent: down to the bottom of the map). */
  maxDepth?: number | null;
  /** How strongly it wins against the other biomes where they overlap (1 = equal). Higher means bigger and more common. */
  weight: number;
  /** Size of one region, in small blocks (original value x BLOCK_SCALE). */
  noiseScale: number;
  blockPalette?: BiomeBlockPalette | null;
  /** Fluid key -> multiplier on how many pockets of it are made here (1 = as usual, 0 = none). */
  fluidWeights?: Record<string, number> | null;
  /** Gas key -> multiplier on how many pockets of it are made here. */
  gasWeights?: Record<string, number> | null;
  /** Mob id -> chance weight when a cavern mob is spawned here. Empty/absent: the map's usual mob list. */
  mobSpawns?: Record<string, number> | null;
  ambient?: BiomeAmbient | null;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

/** What the client needs of a biome, sent once with the map. `index` is the value stored per cell. */
export interface BiomeClientDefinition {
  index: number;
  key: string;
  name: string;
  ambient: BiomeAmbient;
}

/** The key of the built-in default biome that stands in when the database has none. */
export const DEFAULT_BIOME_KEY = 'default';

/** Size of a default biome region: 15 of the original blocks. */
export const DEFAULT_BIOME_NOISE_SCALE = 45;

/** The built-in default biome: the old recipe, no depth limits, nothing changed. */
export const BUILT_IN_DEFAULT_BIOME: Readonly<BiomeDefinition> = {
  id: 'biome-default',
  key: DEFAULT_BIOME_KEY,
  name: 'Default',
  isDefault: true,
  minDepth: 0,
  maxDepth: null,
  weight: 1,
  noiseScale: DEFAULT_BIOME_NOISE_SCALE,
};

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const BIOME_KEY = /^[a-z][a-z0-9_]*$/;

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function validateWeightMap(name: string, value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (typeof value !== 'object' || Array.isArray(value)) return [`${name} must be an object or null`];
  const errors: string[] = [];
  for (const [key, weight] of Object.entries(value as Record<string, unknown>)) {
    if (!isNumber(weight) || weight < 0) errors.push(`${name}.${key} must be a number, 0 or more`);
  }
  return errors;
}

/** Problems with a block palette, one message each (empty when it is valid). */
export function validateBlockPalette(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (typeof value !== 'object' || Array.isArray(value)) return ['blockPalette must be an object or null'];
  const palette = value as Record<string, unknown>;
  const errors = validateWeightMap('blockPalette.weights', palette.weights);
  if (palette.swaps !== undefined && palette.swaps !== null) {
    if (!Array.isArray(palette.swaps)) return [...errors, 'blockPalette.swaps must be a list'];
    palette.swaps.forEach((swap, i) => {
      const s = (swap ?? {}) as Record<string, unknown>;
      if (typeof s.from !== 'string' || s.from === '') errors.push(`blockPalette.swaps[${i}].from is required`);
      if (typeof s.to !== 'string' || s.to === '') errors.push(`blockPalette.swaps[${i}].to is required`);
      if (s.from !== undefined && s.from === s.to) errors.push(`blockPalette.swaps[${i}] swaps a block for itself`);
      if (s.chance !== undefined && (!isNumber(s.chance) || s.chance < 0 || s.chance > 1)) {
        errors.push(`blockPalette.swaps[${i}].chance must be between 0 and 1`);
      }
    });
  }
  return errors;
}

/** Problems with an ambient value, one message each (empty when it is valid). */
export function validateBiomeAmbient(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (typeof value !== 'object' || Array.isArray(value)) return ['ambient must be an object or null'];
  const a = value as Record<string, unknown>;
  const errors: string[] = [];
  if (a.tint !== undefined && a.tint !== null && (typeof a.tint !== 'string' || !HEX_COLOR.test(a.tint))) {
    errors.push('ambient.tint must be a #rrggbb hex colour');
  }
  if (a.wallTextureUrl !== undefined && a.wallTextureUrl !== null) {
    if (typeof a.wallTextureUrl !== 'string' || !a.wallTextureUrl.startsWith('/assets/')) {
      errors.push('ambient.wallTextureUrl must be an /assets/... url');
    }
  }
  return errors;
}

/**
 * Problems with a biome definition, one message each (empty when it is valid). The rules that keep the generator sane:
 * a depth window that has rows in it, and weights that are never negative.
 */
export function validateBiome(biome: Partial<BiomeDefinition>): string[] {
  const errors: string[] = [];
  if (typeof biome.key !== 'string' || !BIOME_KEY.test(biome.key)) {
    errors.push('key must be lower case letters, digits and underscores, starting with a letter');
  }
  if (typeof biome.name !== 'string' || biome.name.trim() === '') errors.push('name is required');
  if (!isNumber(biome.minDepth) || biome.minDepth < 0) errors.push('minDepth must be 0 or more');
  if (biome.maxDepth !== undefined && biome.maxDepth !== null) {
    if (!isNumber(biome.maxDepth) || biome.maxDepth < 0) errors.push('maxDepth must be 0 or more');
    else if (isNumber(biome.minDepth) && biome.minDepth > biome.maxDepth) errors.push('minDepth cannot be greater than maxDepth');
  }
  if (!isNumber(biome.weight) || biome.weight <= 0) errors.push('weight must be greater than 0');
  if (!isNumber(biome.noiseScale) || biome.noiseScale < 3) errors.push('noiseScale must be at least 3');
  errors.push(...validateBlockPalette(biome.blockPalette));
  errors.push(...validateWeightMap('fluidWeights', biome.fluidWeights));
  errors.push(...validateWeightMap('gasWeights', biome.gasWeights));
  errors.push(...validateWeightMap('mobSpawns', biome.mobSpawns));
  errors.push(...validateBiomeAmbient(biome.ambient));
  return errors;
}
