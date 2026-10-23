import { BLOCK_SCALE, MINING_CONFIG } from './mining';
import type { ExtractorSoundEffectsConfig, ExtractorSoundSlotRefs } from './sound';

/**
 * The extractor: the machine that lands on the surface at the start of a run and takes loot off the player's hands
 * (tickets 119-127). Everything about how it works is data on this definition (never a constant in logic), so an
 * upgrade is a different row or a scaled copy. Lengths and speeds are in small blocks (an original value x
 * `BLOCK_SCALE`); the footprint is in cells too, only the texture is pixels.
 */
export interface ExtractorDefinition {
  id: string;
  /** Open unique key, e.g. 'basic_extractor'. */
  key: string;
  name: string;
  description?: string | null;
  /** Art for the machine, an `/assets/...` url. Null: the client draws a placeholder. */
  textureUrl?: string | null;
  /** Art for one belt segment, an `/assets/...` url (tileable, `shaftWidth` cells wide). Null: a placeholder. */
  beltTextureUrl?: string | null;
  /** Footprint in cells, standing on the surface. */
  width: number;
  height: number;
  /** Cells from the entrance to the middle of the machine on the surface (it never stands on the exit). */
  entranceOffset: number;
  /** Seconds the flying-in landing takes at the start of a run. */
  landingSeconds: number;
  /** Width of the shaft dug for the belt, in cells. */
  shaftWidth: number;
  /** Seconds to lay one belt segment. */
  buildSecondsPerSegment: number;
  /** How fast items ride the belt, in cells per second. */
  beltSpeed: number;
  /** Units the extractor takes per second from a player standing at its deposit zone. */
  depositItemsPerSecond: number;
  /** Items taken off the player per second when they unload onto the belt. */
  unloadItemsPerSecond: number;
  /** Least gap between two items riding the belt, in cells; a belt with no gap at the spot refuses another. */
  beltItemSpacing: number;
  /** Hit points of one belt segment. */
  beltSegmentHealth: number;
  /** Hit points of the extractor itself. */
  health: number;
  /** ParticleEffect (by id) played where it lands. Null: none. */
  landingParticleEffectId?: string | null;
  /** The one used when a run does not pick (at most one row should have it). */
  isDefault?: boolean;
  /** Sound slots as stored: library sounds by id, each with its own volume (see `resolveExtractorSounds`). */
  soundEffects?: ExtractorSoundSlotRefs | null;
  /** The same slots resolved to playable urls. Filled in when definitions load; never stored. */
  sounds?: ExtractorSoundEffectsConfig | null;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

/** The extractor used when the database has none, so a run can always land one. Mirrors the dev seed in `extractors.json`. */
export const DEFAULT_EXTRACTOR: Readonly<ExtractorDefinition> = {
  id: 'default_extractor',
  key: 'basic_extractor',
  name: 'Basic Extractor',
  description: 'The standard extractor.',
  textureUrl: null,
  beltTextureUrl: null,
  width: 4 * BLOCK_SCALE,
  height: 3 * BLOCK_SCALE,
  entranceOffset: 8 * BLOCK_SCALE,
  landingSeconds: 3,
  shaftWidth: 3,
  buildSecondsPerSegment: 6,
  beltSpeed: 6,
  depositItemsPerSecond: 20,
  unloadItemsPerSecond: 4,
  beltItemSpacing: 1.5,
  beltSegmentHealth: 100,
  health: 500,
  landingParticleEffectId: null,
  isDefault: true,
  soundEffects: null,
};

const EXTRACTOR_KEY = /^[a-z][a-z0-9_]*$/;

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isWholeAtLeast = (v: unknown, min: number): boolean => isNumber(v) && Number.isInteger(v) && v >= min;
const isPositive = (v: unknown): boolean => isNumber(v) && v > 0;

/** Problems with an extractor definition, one message each (empty when it is valid). */
export function validateExtractor(extractor: Partial<ExtractorDefinition>): string[] {
  const errors: string[] = [];
  if (typeof extractor.key !== 'string' || !EXTRACTOR_KEY.test(extractor.key)) {
    errors.push('key must be lower case letters, digits and underscores, starting with a letter');
  }
  if (typeof extractor.name !== 'string' || extractor.name.trim() === '') errors.push('name is required');
  for (const field of ['textureUrl', 'beltTextureUrl'] as const) {
    const url = extractor[field];
    if (url !== undefined && url !== null && (typeof url !== 'string' || !url.startsWith('/assets/'))) errors.push(`${field} must be an /assets/... url`);
  }
  if (!isWholeAtLeast(extractor.width, 1)) errors.push('width must be a whole number of at least 1');
  if (!isWholeAtLeast(extractor.height, 1)) errors.push('height must be a whole number of at least 1');
  if (!isNumber(extractor.entranceOffset) || Math.abs(extractor.entranceOffset) < 1) errors.push('entranceOffset must be at least 1 cell away from the entrance (either side)');
  if (!isPositive(extractor.landingSeconds)) errors.push('landingSeconds must be greater than 0');
  if (!isWholeAtLeast(extractor.shaftWidth, 1)) errors.push('shaftWidth must be a whole number of at least 1');
  if (!isPositive(extractor.buildSecondsPerSegment)) errors.push('buildSecondsPerSegment must be greater than 0');
  if (!isPositive(extractor.beltSpeed)) errors.push('beltSpeed must be greater than 0');
  if (!isPositive(extractor.depositItemsPerSecond)) errors.push('depositItemsPerSecond must be greater than 0');
  if (!isPositive(extractor.unloadItemsPerSecond)) errors.push('unloadItemsPerSecond must be greater than 0');
  if (!isPositive(extractor.beltItemSpacing)) errors.push('beltItemSpacing must be greater than 0');
  if (!isPositive(extractor.beltSegmentHealth)) errors.push('beltSegmentHealth must be greater than 0');
  if (!isPositive(extractor.health)) errors.push('health must be greater than 0');
  return errors;
}

/**
 * The extractor a run lands: the one marked default, else the first, else the built-in one. `extractors` is in
 * load order, so the choice is the same on every server.
 */
export function pickDefaultExtractor(extractors: readonly ExtractorDefinition[]): ExtractorDefinition {
  return extractors.find((e) => e.isDefault) ?? extractors[0] ?? { ...DEFAULT_EXTRACTOR };
}

/** Where an extractor stands on the surface: its top-left cell, and the cells it covers. */
export interface ExtractorPlacement {
  /** Left column of the belt's shaft: centred under the machine, `shaftWidth` cells wide, going down from the ground. */
  shaftX: number;
  /** Left column and top row of the footprint (the machine's bottom row is the last sky row, standing on the ground). */
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Where the extractor stands: `entranceOffset` cells from the entrance to its middle, its feet on the ground at
 * `surfaceRow`. Pure (same definition and map size, same place), and kept clear of the exit: if the offset would put
 * it over the entrance it is pushed to the side, and it never leaves the map.
 */
export function placeExtractor(
  extractor: Pick<ExtractorDefinition, 'width' | 'height' | 'entranceOffset'> & Partial<Pick<ExtractorDefinition, 'shaftWidth'>>,
  surfaceRow: number,
  gridWidth: number,
  entranceX: number = MINING_CONFIG.ENTRANCE_X
): ExtractorPlacement {
  const { width, height } = extractor;
  const side = extractor.entranceOffset < 0 ? -1 : 1;
  // The nearest the middle may be to the entrance so the machine's edge stays a block clear of the exit
  const minDistance = Math.ceil(width / 2) + BLOCK_SCALE;
  const distance = Math.max(Math.abs(extractor.entranceOffset), minDistance);
  let left = Math.round(entranceX + side * distance - width / 2);
  left = Math.max(0, Math.min(gridWidth - width, left));
  const shaftWidth = Math.min(width, Math.max(1, extractor.shaftWidth ?? DEFAULT_EXTRACTOR.shaftWidth));
  return { x: left, y: surfaceRow - height, width, height, shaftX: left + Math.floor((width - shaftWidth) / 2) };
}

/** How far (0 to 1 of the start height) the machine still is above the ground at a point in the landing: fast at first, easing in. */
export function landingHeightFraction(progress: number): number {
  const p = Math.min(1, Math.max(0, progress));
  return (1 - p) * (1 - p) * (1 - p);
}

/** Where the landing is: 0 just started, 1 down. A landing of no length, or one already over, is down. */
export function landingProgress(elapsedSeconds: number, durationSeconds: number): number {
  if (!(durationSeconds > 0)) return 1;
  return Math.min(1, Math.max(0, elapsedSeconds / durationSeconds));
}
