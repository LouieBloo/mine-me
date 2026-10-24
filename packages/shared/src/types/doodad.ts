import { BLOCK_SCALE } from './mining';
import type { DoodadSoundEffectsConfig, DoodadSoundSlotRefs } from './sound';
import type { ItemLightConfig } from './index';
import { isDoodadMotionPreset, DOODAD_MOTION_PRESET_NAMES } from '../gameLogic/doodad/doodadMotion';

/**
 * Doodads (tickets 099-107): purely environmental decoration - mushrooms, grass, dripping caves, bugs, crystals, moss.
 * They live behind the characters, are never interactable, and are anchored to a surface or float in open air.
 * A doodad is a row, like a fluid or a biome: nothing in logic names one.
 *
 * Units: sizes, distances and depths are in small blocks (the original value x BLOCK_SCALE); only sprite offsets
 * and pivots are pixels (of the doodad's own picture).
 */

/** What a doodad is attached to: the top of a block (FLOOR), the underside of one (CEILING), the side of one (WALL), or nothing (AIR). */
export type DoodadAnchor = 'FLOOR' | 'CEILING' | 'WALL' | 'AIR';

export const DOODAD_ANCHORS: readonly DoodadAnchor[] = ['FLOOR', 'CEILING', 'WALL', 'AIR'];

export const isDoodadAnchor = (value: unknown): value is DoodadAnchor => typeof value === 'string' && (DOODAD_ANCHORS as readonly string[]).includes(value);

/** Whether the doodad hangs on a block, so it goes when that block does (ticket 105). Free-floating (AIR) doodads never do. */
export const doodadNeedsSupport = (anchor: DoodadAnchor): boolean => anchor !== 'AIR';

/** Another size a doodad comes in. A placed doodad picks one by weight. */
export interface DoodadSizeVariant {
  /** Footprint in small blocks. */
  width: number;
  height: number;
  /** Chance weight against the other variants. */
  weight: number;
  /** A picture for this size (null/absent: the doodad's own, scaled). */
  textureUrl?: string | null;
}

/**
 * One picture of a doodad that can move on its own, like a part of the character rig (`SkeletonPartDef`): a tall
 * mushroom sways at the top and stays planted at the bottom. Pixels, in the part's own picture.
 */
export interface DoodadPartDef {
  /** Open name the motion presets address (e.g. 'cap', 'stem', 'drop'). */
  name: string;
  /** `/assets/...` url of the part's picture. */
  file: string;
  width: number;
  height: number;
  /** The point of the picture it turns about, as [x, y] from its top-left. */
  pivot_anchor: [number, number];
  /** Where the pivot sits relative to the doodad's anchor point, as [x, y] in pixels. */
  offset_from_anchor: [number, number];
  z_index: number;
}

/** Procedural motion on the still picture (ticket 103). `preset` names an entry of the motion registry; the numbers are its parameters. */
export interface DoodadMotion {
  preset: string;
  /** Cycles per second (absent: the preset's own). */
  speed?: number;
  /** How far it goes (absent: the preset's own). */
  amplitude?: number;
  /** Start of the cycle, 0 to 1. Absent: each placed doodad gets its own, so a field does not move in step. */
  phase?: number;
  /** Anything else a preset reads. */
  params?: Record<string, number>;
}

/** How a doodad answers a body walking past (ticket 104): cosmetic, client-only. */
export interface DoodadReacts {
  /** How hard it wiggles, 0 to 1. */
  strength: number;
  /** How near a body must be, in small blocks. */
  radius: number;
  /** An optional puff of this particle effect (a `ParticleEffect` id) when it is brushed. */
  puffEffectId?: string | null;
}

export type DoodadWanderMode = 'CRAWL' | 'FLUTTER' | 'HOP';

export const DOODAD_WANDER_MODES: readonly DoodadWanderMode[] = ['CRAWL', 'FLUTTER', 'HOP'];

/** A small client-side wander for bugs (ticket 106). */
export interface DoodadWander {
  mode: DoodadWanderMode;
  /** How far from the anchor it strays, in small blocks. */
  radius: number;
  /** Small blocks per second. */
  speed: number;
  /** How long it rests between moves, in milliseconds. */
  pauseMs: number;
}

/** Where a doodad may be generated (ticket 100). Every field is optional: absent means no restriction. */
export interface DoodadSpawnRules {
  /** First and last row (0 = ground surface) it may appear on, in small blocks. */
  minDepth?: number | null;
  maxDepth?: number | null;
  /** Block keys it may sit on / hang from / lean against (absent or empty: any). */
  blocks?: string[] | null;
  /** Fluid and gas keys it must be near (absent or empty: no need). */
  nearFluids?: string[] | null;
  nearGases?: string[] | null;
  /** How near "near" is, in small blocks (default 6 x BLOCK_SCALE / 3 = 6). */
  nearRadius?: number | null;
  /** Only where the cell is dark. */
  darkOnly?: boolean;
  /** No other doodad of the same kind this close, in small blocks. */
  minSpacing?: number | null;
}

/** The default `nearRadius`: two original blocks. */
export const DEFAULT_DOODAD_NEAR_RADIUS = 2 * BLOCK_SCALE;

/** A light on a doodad: the usual light config plus where it sits relative to the anchor point (pixels). */
export interface DoodadLightConfig extends ItemLightConfig {
  offsetX?: number;
  offsetY?: number;
}

/** Where a doodad appears and how strongly. */
export interface DoodadBiomeLink {
  biomeId: string;
  /** The biome's key (filled in on load, so consumers need not look it up). */
  biomeKey?: string;
  /** Chance weight against the other doodads of the biome. */
  weight: number;
  /** How many are placed (1 = the usual amount). */
  density: number;
}

/** A doodad as stored in the database and used by the generator. */
export interface DoodadDefinition {
  id: string;
  /** Open unique key, e.g. 'glow_mushroom'. */
  key: string;
  name: string;
  description?: string | null;
  anchor: DoodadAnchor;
  /** Footprint in small blocks. */
  width: number;
  height: number;
  sizeVariants?: DoodadSizeVariant[] | null;
  textureUrl?: string | null;
  parts?: DoodadPartDef[] | null;
  /** Draw order among doodads (higher is drawn later). */
  zOffset: number;
  motion?: DoodadMotion | null;
  reacts?: DoodadReacts | null;
  light?: DoodadLightConfig | null;
  particleEffectId?: string | null;
  /** Where the effect plays, relative to the anchor point (pixels). */
  particleOffsetX?: number;
  particleOffsetY?: number;
  /** Sound slots as stored: library sounds by id (see `resolveDoodadSounds`). */
  soundEffects?: DoodadSoundSlotRefs | null;
  /** The same slots resolved to playable urls. Filled in when definitions load; never stored. */
  sounds?: DoodadSoundEffectsConfig | null;
  wander?: DoodadWander | null;
  spawn?: DoodadSpawnRules | null;
  /** The biomes it appears in. */
  biomes: DoodadBiomeLink[];
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

/**
 * What the client needs of a doodad, sent once with the map. `index` is the value stored per placement. The spawn rules and
 * biome links are the generator's business and are not sent.
 */
export interface DoodadClientDefinition {
  index: number;
  key: string;
  name: string;
  anchor: DoodadAnchor;
  width: number;
  height: number;
  sizeVariants?: DoodadSizeVariant[];
  textureUrl?: string | null;
  parts?: DoodadPartDef[];
  zOffset: number;
  motion?: DoodadMotion;
  reacts?: DoodadReacts;
  light?: DoodadLightConfig;
  particleEffectId?: string | null;
  particleOffsetX?: number;
  particleOffsetY?: number;
  sounds?: DoodadSoundEffectsConfig;
  wander?: DoodadWander;
}

/** The client's view of a doodad (see `DoodadClientDefinition`). Absent optional values are left out, to keep the wire small. */
export function toClientDoodad(doodad: DoodadDefinition, index: number): DoodadClientDefinition {
  const out: DoodadClientDefinition = {
    index,
    key: doodad.key,
    name: doodad.name,
    anchor: doodad.anchor,
    width: doodad.width,
    height: doodad.height,
    zOffset: doodad.zOffset,
  };
  if (doodad.sizeVariants?.length) out.sizeVariants = doodad.sizeVariants;
  if (doodad.textureUrl) out.textureUrl = doodad.textureUrl;
  if (doodad.parts?.length) out.parts = doodad.parts;
  if (doodad.motion) out.motion = doodad.motion;
  if (doodad.reacts) out.reacts = doodad.reacts;
  if (doodad.light?.enabled !== false && doodad.light) out.light = doodad.light;
  if (doodad.particleEffectId) {
    out.particleEffectId = doodad.particleEffectId;
    if (doodad.particleOffsetX) out.particleOffsetX = doodad.particleOffsetX;
    if (doodad.particleOffsetY) out.particleOffsetY = doodad.particleOffsetY;
  }
  if (doodad.sounds && Object.keys(doodad.sounds).length > 0) out.sounds = doodad.sounds;
  if (doodad.wander) out.wander = doodad.wander;
  return out;
}

/** The sizes a placed doodad may take: its variants, or just its own footprint when it has none. */
export function doodadSizeChoices(doodad: Pick<DoodadDefinition, 'width' | 'height' | 'sizeVariants'>): DoodadSizeVariant[] {
  const variants = (doodad.sizeVariants ?? []).filter((v) => v.weight > 0);
  return variants.length > 0 ? variants : [{ width: doodad.width, height: doodad.height, weight: 1 }];
}

const DOODAD_KEY = /^[a-z][a-z0-9_]*$/;
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isWhole = (v: unknown, min: number): v is number => isNumber(v) && Number.isInteger(v) && v >= min;
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isAssetUrl = (v: unknown): boolean => typeof v === 'string' && v.startsWith('/assets/');
const isPair = (v: unknown): v is [number, number] => Array.isArray(v) && v.length === 2 && v.every(isNumber);
const isStringList = (v: unknown): v is string[] => Array.isArray(v) && v.every((s) => typeof s === 'string' && s !== '');

/** Problems with the size variants, one message each (empty when valid). */
export function validateDoodadSizeVariants(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value)) return ['sizeVariants must be a list or null'];
  const errors: string[] = [];
  value.forEach((v, i) => {
    if (!isObject(v)) {
      errors.push(`sizeVariants[${i}] must be an object`);
      return;
    }
    if (!isWhole(v.width, 1)) errors.push(`sizeVariants[${i}].width must be a whole number of at least 1`);
    if (!isWhole(v.height, 1)) errors.push(`sizeVariants[${i}].height must be a whole number of at least 1`);
    if (!isNumber(v.weight) || v.weight < 0) errors.push(`sizeVariants[${i}].weight must be a number, 0 or more`);
    if (v.textureUrl !== undefined && v.textureUrl !== null && !isAssetUrl(v.textureUrl)) errors.push(`sizeVariants[${i}].textureUrl must be an /assets/... url`);
  });
  if (value.length > 0 && !value.some((v) => isObject(v) && isNumber(v.weight) && v.weight > 0)) {
    errors.push('sizeVariants needs at least one with a weight above 0');
  }
  return errors;
}

/** Problems with the parts, one message each (empty when valid). */
export function validateDoodadParts(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value)) return ['parts must be a list or null'];
  const errors: string[] = [];
  const names = new Set<string>();
  value.forEach((p, i) => {
    if (!isObject(p)) {
      errors.push(`parts[${i}] must be an object`);
      return;
    }
    if (typeof p.name !== 'string' || p.name === '') errors.push(`parts[${i}].name is required`);
    else if (names.has(p.name)) errors.push(`parts[${i}].name "${p.name}" is used twice`);
    else names.add(p.name);
    if (!isAssetUrl(p.file)) errors.push(`parts[${i}].file must be an /assets/... url`);
    if (!isNumber(p.width) || p.width <= 0) errors.push(`parts[${i}].width must be greater than 0`);
    if (!isNumber(p.height) || p.height <= 0) errors.push(`parts[${i}].height must be greater than 0`);
    if (!isPair(p.pivot_anchor)) errors.push(`parts[${i}].pivot_anchor must be [x, y]`);
    if (!isPair(p.offset_from_anchor)) errors.push(`parts[${i}].offset_from_anchor must be [x, y]`);
    if (!isNumber(p.z_index)) errors.push(`parts[${i}].z_index must be a number`);
  });
  return errors;
}

/** Problems with the motion, one message each (empty when valid). The preset must be one of the motion registry's (ticket 103). */
export function validateDoodadMotion(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (!isObject(value)) return ['motion must be an object or null'];
  const errors: string[] = [];
  if (typeof value.preset !== 'string' || value.preset === '') errors.push('motion.preset is required');
  else if (!isDoodadMotionPreset(value.preset)) errors.push(`motion.preset must be one of ${DOODAD_MOTION_PRESET_NAMES.join(', ')}`);
  if (value.speed !== undefined && (!isNumber(value.speed) || value.speed < 0)) errors.push('motion.speed must be 0 or more');
  if (value.amplitude !== undefined && !isNumber(value.amplitude)) errors.push('motion.amplitude must be a number');
  if (value.phase !== undefined && (!isNumber(value.phase) || value.phase < 0 || value.phase > 1)) errors.push('motion.phase must be between 0 and 1');
  if (value.params !== undefined) {
    if (!isObject(value.params)) errors.push('motion.params must be an object');
    else for (const [k, v] of Object.entries(value.params)) if (!isNumber(v)) errors.push(`motion.params.${k} must be a number`);
  }
  return errors;
}

/** Problems with the body reaction, one message each (empty when valid). */
export function validateDoodadReacts(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (!isObject(value)) return ['reacts must be an object or null'];
  const errors: string[] = [];
  if (!isNumber(value.strength) || value.strength < 0 || value.strength > 1) errors.push('reacts.strength must be between 0 and 1');
  if (!isNumber(value.radius) || value.radius <= 0) errors.push('reacts.radius must be greater than 0');
  if (value.puffEffectId !== undefined && value.puffEffectId !== null && (typeof value.puffEffectId !== 'string' || value.puffEffectId === '')) {
    errors.push('reacts.puffEffectId must be an effect id or null');
  }
  return errors;
}

/** Problems with the wander, one message each (empty when valid). */
export function validateDoodadWander(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (!isObject(value)) return ['wander must be an object or null'];
  const errors: string[] = [];
  if (!(DOODAD_WANDER_MODES as readonly unknown[]).includes(value.mode)) errors.push(`wander.mode must be one of ${DOODAD_WANDER_MODES.join(', ')}`);
  if (!isNumber(value.radius) || value.radius <= 0) errors.push('wander.radius must be greater than 0');
  if (!isNumber(value.speed) || value.speed <= 0) errors.push('wander.speed must be greater than 0');
  if (!isNumber(value.pauseMs) || value.pauseMs < 0) errors.push('wander.pauseMs must be 0 or more');
  return errors;
}

/** Problems with the spawn rules, one message each (empty when valid). Whether the keys exist is checked where the data is. */
export function validateDoodadSpawnRules(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (!isObject(value)) return ['spawn must be an object or null'];
  const errors: string[] = [];
  const optionalNumber = (name: string, min: number) => {
    const v = value[name];
    if (v !== undefined && v !== null && (!isNumber(v) || v < min)) errors.push(`spawn.${name} must be ${min} or more`);
  };
  optionalNumber('minDepth', 0);
  optionalNumber('maxDepth', 0);
  optionalNumber('minSpacing', 0);
  if (value.nearRadius !== undefined && value.nearRadius !== null && (!isNumber(value.nearRadius) || value.nearRadius <= 0)) {
    errors.push('spawn.nearRadius must be greater than 0');
  }
  if (isNumber(value.minDepth) && isNumber(value.maxDepth) && value.minDepth > value.maxDepth) errors.push('spawn.minDepth cannot be greater than maxDepth');
  for (const name of ['blocks', 'nearFluids', 'nearGases'] as const) {
    const v = value[name];
    if (v !== undefined && v !== null && !isStringList(v)) errors.push(`spawn.${name} must be a list of keys or null`);
  }
  if (value.darkOnly !== undefined && typeof value.darkOnly !== 'boolean') errors.push('spawn.darkOnly must be true or false');
  return errors;
}

/** Problems with a doodad's light, one message each (empty when valid). */
export function validateDoodadLight(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (!isObject(value)) return ['light must be a light config or null'];
  const errors: string[] = [];
  if (!isNumber(value.radius) || value.radius <= 0 || !isNumber(value.intensity) || value.intensity <= 0) errors.push('light needs a radius and intensity above 0');
  for (const name of ['offsetX', 'offsetY'] as const) if (value[name] !== undefined && !isNumber(value[name])) errors.push(`light.${name} must be a number`);
  return errors;
}

/** Problems with a doodad's biome links, one message each (empty when valid). Whether the biomes exist is checked where the data is. */
export function validateDoodadBiomes(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value)) return ['biomes must be a list'];
  const errors: string[] = [];
  const seen = new Set<string>();
  value.forEach((b, i) => {
    if (!isObject(b)) {
      errors.push(`biomes[${i}] must be an object`);
      return;
    }
    const ref = typeof b.biomeId === 'string' && b.biomeId !== '' ? b.biomeId : typeof b.biomeKey === 'string' && b.biomeKey !== '' ? b.biomeKey : null;
    if (!ref) errors.push(`biomes[${i}] needs a biomeId or biomeKey`);
    else if (seen.has(ref)) errors.push(`biomes[${i}] lists ${ref} twice`);
    else seen.add(ref);
    if (b.weight !== undefined && (!isNumber(b.weight) || b.weight < 0)) errors.push(`biomes[${i}].weight must be a number, 0 or more`);
    if (b.density !== undefined && (!isNumber(b.density) || b.density < 0)) errors.push(`biomes[${i}].density must be a number, 0 or more`);
  });
  return errors;
}

/**
 * Problems with a doodad definition, one message each (empty when it is valid). The rules that keep the generator sane:
 * a footprint with cells in it, an anchor that exists, and weights that are never negative.
 */
export function validateDoodad(doodad: Partial<DoodadDefinition>): string[] {
  const errors: string[] = [];
  if (typeof doodad.key !== 'string' || !DOODAD_KEY.test(doodad.key)) {
    errors.push('key must be lower case letters, digits and underscores, starting with a letter');
  }
  if (typeof doodad.name !== 'string' || doodad.name.trim() === '') errors.push('name is required');
  if (!isDoodadAnchor(doodad.anchor)) errors.push(`anchor must be one of ${DOODAD_ANCHORS.join(', ')}`);
  if (!isWhole(doodad.width, 1)) errors.push('width must be a whole number of at least 1');
  if (!isWhole(doodad.height, 1)) errors.push('height must be a whole number of at least 1');
  if (doodad.zOffset !== undefined && !Number.isInteger(doodad.zOffset)) errors.push('zOffset must be a whole number');
  if (doodad.textureUrl !== undefined && doodad.textureUrl !== null && !isAssetUrl(doodad.textureUrl)) errors.push('textureUrl must be an /assets/... url');
  for (const name of ['particleOffsetX', 'particleOffsetY'] as const) if (doodad[name] !== undefined && !isNumber(doodad[name])) errors.push(`${name} must be a number`);
  errors.push(...validateDoodadSizeVariants(doodad.sizeVariants));
  errors.push(...validateDoodadParts(doodad.parts));
  errors.push(...validateDoodadMotion(doodad.motion));
  errors.push(...validateDoodadReacts(doodad.reacts));
  errors.push(...validateDoodadLight(doodad.light));
  errors.push(...validateDoodadWander(doodad.wander));
  // Crawling and hopping are along a surface; a doodad floating in the air has none to cling to
  if (doodad.wander && doodad.anchor === 'AIR' && (doodad.wander.mode === 'CRAWL' || doodad.wander.mode === 'HOP')) {
    errors.push(`wander.mode ${doodad.wander.mode} needs a doodad on a floor, ceiling or wall (an AIR doodad can FLUTTER)`);
  }
  errors.push(...validateDoodadSpawnRules(doodad.spawn));
  errors.push(...validateDoodadBiomes(doodad.biomes));
  return errors;
}
