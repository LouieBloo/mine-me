import type { ItemLightConfig } from './index';
import type { FluidSoundEffectsConfig, FluidSoundSlotRefs } from './sound';

/**
 * What happens when an explosive gas is set alight: instead of burning like a fluid does, it detonates as a
 * front that races through the connected gas. Optional on `Flammability`, so any flammable thing could be
 * explosive, but only gases are handled today.
 */
export interface ExplosionSettings {
  /** Tiles around a detonating cell in which people and mobs are hurt. */
  blastRadius: number;
  /** Damage at the centre of a full cell of this gas, less with distance and with how thin the gas is. */
  damage: number;
  /** How many cells the front moves each gas step (fast, but slow enough to watch). */
  frontSpeed: number;
  /** The thinnest gas that still detonates; thinner gas is left alone and does not carry the front on. Default 0.1. */
  minConcentration?: number;
}

/** The thinnest gas a front crosses when the settings do not say. */
export const DEFAULT_EXPLOSION_MIN_CONCENTRATION = 0.1;

/**
 * How a material (a fluid now, blocks later) burns. Shared by every flammable thing so fire logic
 * has one code path. A material with no Flammability does not burn. Ticket 056 finishes the exact
 * semantics; the fields are stored as one Json column.
 */
export interface Flammability {
  /** Chance (0-1) that one ignition source touching the material sets it alight. */
  ignitionChance: number;
  /** Chance (0-1), per second, that a burning cell lights an adjacent flammable cell. */
  spreadChance: number;
  /** Seconds a cell burns before it is spent (and the fire goes out). */
  burnDuration: number;
  /** Heat the fire gives off, which hurts anything standing close. */
  heat: number;
  /** typeKey of the block left behind when it is spent (null: nothing is left). */
  burnsInto?: string | null;
  /** The ParticleEffect (by id) drawn rising from a burning cell of this material. None: no flames drawn. */
  flameEffectId?: string | null;
  /** The light a burning cell of this material gives off. None: no light. */
  flameLight?: ItemLightConfig | null;
  /** Gases only: set alight, this detonates as a travelling front instead of burning (see `ExplosionSettings`). None: it burns. */
  explosion?: ExplosionSettings | null;
}

/** The outlines a generated pocket can take. All are one connected region of cells. */
export type PocketShape = 'SQUARE' | 'RECTANGLE' | 'VEIN';

/** Every pocket shape, in the order the admin lists them. */
export const POCKET_SHAPES: readonly PocketShape[] = ['SQUARE', 'RECTANGLE', 'VEIN'];

/**
 * How likely each shape is, as weights (not percentages): a shape missing from the list has weight 1 when the list is
 * absent altogether, and 0 when other shapes are listed. Absent: all shapes equally likely.
 */
export type PocketShapeWeights = Partial<Record<PocketShape, number>>;

/** The weight of each shape after defaults: absent means every shape counts the same. */
export function resolveShapeWeights(shapes: PocketShapeWeights | null | undefined): Record<PocketShape, number> {
  const out = { SQUARE: 1, RECTANGLE: 1, VEIN: 1 } as Record<PocketShape, number>;
  if (!shapes || typeof shapes !== 'object') return out;
  for (const shape of POCKET_SHAPES) {
    const w = shapes[shape];
    out[shape] = typeof w === 'number' && Number.isFinite(w) && w >= 0 ? w : 0;
  }
  return out.SQUARE + out.RECTANGLE + out.VEIN > 0 ? out : { SQUARE: 1, RECTANGLE: 1, VEIN: 1 };
}

/**
 * Where a fluid appears when a mine is generated. Two modes:
 *  - `POCKET` (the default): sealed pockets of full cells inside plain dirt, each a square, a rectangle or a winding vein
 *    (see `shapes`), always one connected region.
 *  - `POOL`: shallow puddles lying on the floors of caves and tunnels at any depth in range; `minSize`/`maxSize` is the
 *    width in tiles and `percentage` the share of eligible floor that is pooled.
 * Null/absent on a fluid means it never generates (it only arrives by other means).
 */
export interface FluidGeneration {
  /** `POCKET` (absent: pocket) or `POOL`. */
  mode?: 'POCKET' | 'POOL';
  /** First row (0 = surface) pockets may start on. */
  minDepth: number;
  /** Last row a pocket may reach (null: down to the bottom of the map). */
  maxDepth?: number | null;
  /** Share of the diggable tiles (pockets) or floor tiles (pools) in the depth range that are filled, in percent (0-100). */
  percentage: number;
  /**
   * Smallest and largest side in tiles of a square or rectangle pocket, and of a vein's equivalent area (side x side);
   * for pools, the width.
   */
  minSize: number;
  maxSize: number;
  /** Pockets only: the weight of each shape. Absent: square, rectangle and vein equally likely. */
  shapes?: PocketShapeWeights | null;
}

/**
 * How a fluid looks beyond its colour: surface waves, the highlight on its surface and how it darkens with
 * depth. Stored as one Json column; any missing field takes its default (`resolveFluidAppearance`), so a
 * new look setting never needs a data migration. Thick fluids use small, slow waves; thin ones larger, faster.
 */
export interface FluidAppearance {
  /** Height of the surface waves as a fraction of a cell (0 = still). */
  waveAmplitude: number;
  /** Wave cycles per second. */
  waveSpeed: number;
  /** Strength of the light line and soft glow along the surface, 0 (none) to 1. */
  highlight: number;
  /** How much darker the fluid gets with depth, 0 (none) to 1 (black at full depth). */
  depthDarkening: number;
  /** How much more opaque the fluid gets with depth, 0 (none) to 1 (fully opaque at full depth). */
  depthOpacity: number;
}

export const DEFAULT_FLUID_APPEARANCE: Readonly<FluidAppearance> = {
  waveAmplitude: 0.06,
  waveSpeed: 0.6,
  highlight: 0.5,
  depthDarkening: 0.35,
  depthOpacity: 0.25,
};

/** The range each appearance setting may take (the admin form and validation share it). */
export const FLUID_APPEARANCE_LIMITS: Readonly<Record<keyof FluidAppearance, { min: number; max: number }>> = {
  waveAmplitude: { min: 0, max: 0.3 },
  waveSpeed: { min: 0, max: 4 },
  highlight: { min: 0, max: 1 },
  depthDarkening: { min: 0, max: 1 },
  depthOpacity: { min: 0, max: 1 },
};

/** A stored appearance made whole: missing, wrong-typed or out-of-range fields fall back or clamp. */
export function resolveFluidAppearance(value: unknown): FluidAppearance {
  const stored = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const out = { ...DEFAULT_FLUID_APPEARANCE };
  for (const key of Object.keys(FLUID_APPEARANCE_LIMITS) as (keyof FluidAppearance)[]) {
    const v = stored[key];
    if (typeof v === 'number' && Number.isFinite(v)) {
      const { min, max } = FLUID_APPEARANCE_LIMITS[key];
      out[key] = Math.min(max, Math.max(min, v));
    }
  }
  return out;
}

/** Problems with an appearance value, one message each (empty when it is valid). */
export function validateFluidAppearance(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (typeof value !== 'object' || Array.isArray(value)) return ['appearance must be an object or null'];
  const a = value as Record<string, unknown>;
  const errors: string[] = [];
  for (const [key, { min, max }] of Object.entries(FLUID_APPEARANCE_LIMITS)) {
    if (a[key] !== undefined && !inRange(a[key], min, max)) errors.push(`appearance.${key} must be between ${min} and ${max}`);
  }
  return errors;
}

/**
 * What touching a fluid does to a player or mob standing in it. All data, so a harmful fluid (lava, acid) or a
 * cleansing one (water) is a row, never code. Each part is optional; absent means "does nothing".
 */
export interface FluidContactEffects {
  /** Damage per second at full submersion (scaled by how submerged the body is). 0 or absent: harmless. */
  damagePerSecond?: number;
  /** Strength in percent (like the `Ignites` effect): above 0 the fluid sets bodies in it burning and lights what it touches. */
  ignites?: number;
  /** Entering it puts out burning, and a body in it cannot catch fire. */
  extinguishes?: boolean;
}

/**
 * A reaction between this fluid and another: where a cell of this fluid touches a cell of `with`, the two are
 * used up and the cell becomes the block `becomes` (water on lava leaves lavarock). Defined on one of the two
 * fluids (the reacting one, e.g. lava), the other just has to exist.
 */
export interface FluidReaction {
  /** typeKey of the fluid that sets the reaction off. */
  with: string;
  /** typeKey of the block left behind. */
  becomes: string;
  /** Levels of `with` used up for each level of this fluid hardened (2 = twice as much water as lava). */
  costPerLevel: number;
  /**
   * Most levels of this fluid one cell hardens per simulation step (absent: 0.25, so a full cell takes four steps). It
   * is what lets the water be seen reaching the lava and sitting against it while it cools.
   */
  ratePerStep?: number;
}

/** A fluid as stored in the database and sent to the game. */
export interface FluidDefinition {
  id: string;
  /** Open unique key, e.g. 'OIL'. */
  typeKey: string;
  name: string;
  description?: string | null;
  /** CSS hex colour, e.g. '#0a0a0a'. */
  color: string;
  /** 0 (invisible) to 1 (opaque). */
  opacity: number;
  /** Heavier fluids sink under lighter ones and decide how things float. */
  density: number;
  /** Fraction of movement speed removed at full submersion, 0 to 1. */
  viscosity: number;
  /** Share of the level difference moved per simulation step, 0 to 1. */
  flowRate: number;
  /** A cell below this level evaporates. */
  minLevel: number;
  /** A cell only spreads sideways when the level difference exceeds this. */
  flowThreshold: number;
  /** Null (or absent): the default look (see `resolveFluidAppearance`). */
  appearance?: Partial<FluidAppearance> | null;
  /** Null (or absent): the fluid does not burn. */
  flammability?: Flammability | null;
  /** Null (or absent): the fluid is not placed in generated mines. */
  generation?: FluidGeneration | null;
  /** Null (or absent): touching the fluid does nothing special. */
  contact?: FluidContactEffects | null;
  /** The glow the fluid gives off all the time. Null (or absent): none. */
  light?: ItemLightConfig | null;
  /** Reactions with other fluids. Null (or absent): none. */
  reactions?: FluidReaction[] | null;
  /** Sound slots as stored: library sounds by id (see `resolveFluidSounds`). */
  soundEffects?: FluidSoundSlotRefs | null;
  /** The same slots resolved to playable urls. Filled in when definitions load; never stored. */
  sounds?: FluidSoundEffectsConfig | null;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const FLUID_KEY = /^[A-Z][A-Z0-9_]*$/;

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const inRange = (v: unknown, min: number, max: number): boolean => isNumber(v) && v >= min && v <= max;

/** Problems with a flammability value, one message each (empty when it is valid). */
export function validateFlammability(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (typeof value !== 'object' || Array.isArray(value)) return ['flammability must be an object or null'];
  const f = value as Record<string, unknown>;
  const errors: string[] = [];
  if (!inRange(f.ignitionChance, 0, 1)) errors.push('flammability.ignitionChance must be between 0 and 1');
  if (!inRange(f.spreadChance, 0, 1)) errors.push('flammability.spreadChance must be between 0 and 1');
  if (!isNumber(f.burnDuration) || f.burnDuration <= 0) errors.push('flammability.burnDuration must be greater than 0');
  if (!isNumber(f.heat) || f.heat < 0) errors.push('flammability.heat must be 0 or more');
  if (f.burnsInto !== undefined && f.burnsInto !== null && typeof f.burnsInto !== 'string') {
    errors.push('flammability.burnsInto must be a block key or null');
  }
  if (f.flameEffectId !== undefined && f.flameEffectId !== null && typeof f.flameEffectId !== 'string') {
    errors.push('flammability.flameEffectId must be a particle effect id or null');
  }
  if (f.flameLight !== undefined && f.flameLight !== null) {
    const light = f.flameLight as Record<string, unknown>;
    if (typeof light !== 'object' || Array.isArray(light)) {
      errors.push('flammability.flameLight must be a light config or null');
    } else if (!isNumber(light.radius) || light.radius <= 0 || !isNumber(light.intensity) || light.intensity <= 0) {
      errors.push('flammability.flameLight needs a radius and intensity above 0');
    }
  }
  errors.push(...validateExplosion(f.explosion));
  return errors;
}

/** Problems with an explosion value, one message each (empty when it is valid). */
export function validateExplosion(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (typeof value !== 'object' || Array.isArray(value)) return ['flammability.explosion must be an object or null'];
  const e = value as Record<string, unknown>;
  const errors: string[] = [];
  if (!isNumber(e.blastRadius) || e.blastRadius <= 0) errors.push('flammability.explosion.blastRadius must be greater than 0');
  if (!isNumber(e.damage) || e.damage <= 0) errors.push('flammability.explosion.damage must be greater than 0');
  if (!isNumber(e.frontSpeed) || e.frontSpeed < 1 || !Number.isInteger(e.frontSpeed)) errors.push('flammability.explosion.frontSpeed must be a whole number of 1 or more');
  if (e.minConcentration !== undefined && e.minConcentration !== null && (!isNumber(e.minConcentration) || e.minConcentration <= 0 || e.minConcentration > 1)) {
    errors.push('flammability.explosion.minConcentration must be above 0 and at most 1');
  }
  return errors;
}

/** Problems with a shape weights value, one message each (empty when it is valid). */
export function validatePocketShapes(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (typeof value !== 'object' || Array.isArray(value)) return ['generation.shapes must be an object or null'];
  const errors: string[] = [];
  let total = 0;
  for (const [key, weight] of Object.entries(value as Record<string, unknown>)) {
    if (!(POCKET_SHAPES as readonly string[]).includes(key)) errors.push(`generation.shapes.${key} is not a shape`);
    else if (!isNumber(weight) || weight < 0) errors.push(`generation.shapes.${key} must be 0 or more`);
    else total += weight;
  }
  if (errors.length === 0 && total <= 0 && Object.keys(value as object).length > 0) errors.push('generation.shapes needs at least one shape above 0');
  return errors;
}

/** Problems with a generation value, one message each (empty when it is valid). */
export function validateFluidGeneration(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (typeof value !== 'object' || Array.isArray(value)) return ['generation must be an object or null'];
  const g = value as Record<string, unknown>;
  const errors: string[] = [];
  const isInt = (v: unknown): v is number => isNumber(v) && Number.isInteger(v);
  if (!isInt(g.minDepth) || g.minDepth < 1) errors.push('generation.minDepth must be a whole number of 1 or more');
  if (g.maxDepth !== undefined && g.maxDepth !== null) {
    if (!isInt(g.maxDepth)) errors.push('generation.maxDepth must be a whole number or null');
    else if (isInt(g.minDepth) && g.maxDepth < g.minDepth) errors.push('generation.maxDepth must not be above minDepth');
  }
  if (!inRange(g.percentage, 0, 100)) errors.push('generation.percentage must be between 0 and 100');
  if (!isInt(g.minSize) || g.minSize < 1) errors.push('generation.minSize must be a whole number of 1 or more');
  if (!isInt(g.maxSize)) errors.push('generation.maxSize must be a whole number');
  else if (isInt(g.minSize) && g.maxSize < g.minSize) errors.push('generation.maxSize must not be below minSize');
  if (g.mode !== undefined && g.mode !== null && g.mode !== 'POCKET' && g.mode !== 'POOL') errors.push('generation.mode must be POCKET or POOL');
  errors.push(...validatePocketShapes(g.shapes));
  return errors;
}

/** Problems with a contact value, one message each (empty when it is valid). */
export function validateFluidContact(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (typeof value !== 'object' || Array.isArray(value)) return ['contact must be an object or null'];
  const c = value as Record<string, unknown>;
  const errors: string[] = [];
  if (c.damagePerSecond !== undefined && (!isNumber(c.damagePerSecond) || c.damagePerSecond < 0)) errors.push('contact.damagePerSecond must be 0 or more');
  if (c.ignites !== undefined && !inRange(c.ignites, 0, 1000)) errors.push('contact.ignites must be between 0 and 1000');
  if (c.extinguishes !== undefined && typeof c.extinguishes !== 'boolean') errors.push('contact.extinguishes must be true or false');
  if (c.extinguishes === true && isNumber(c.ignites) && c.ignites > 0) errors.push('contact cannot both ignite and extinguish');
  return errors;
}

/** Problems with a fluid's glow, one message each (empty when it is valid). */
export function validateFluidLight(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (typeof value !== 'object' || Array.isArray(value)) return ['light must be a light config or null'];
  const light = value as Record<string, unknown>;
  if (!isNumber(light.radius) || light.radius <= 0 || !isNumber(light.intensity) || light.intensity <= 0) {
    return ['light needs a radius and intensity above 0'];
  }
  return [];
}

/** Problems with a reactions list, one message each (empty when it is valid). Whether the keys exist is checked where the data is. */
export function validateFluidReactions(value: unknown, ownKey?: string): string[] {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value)) return ['reactions must be a list or null'];
  const errors: string[] = [];
  value.forEach((r, i) => {
    const reaction = r as Record<string, unknown> | null;
    if (!reaction || typeof reaction !== 'object') {
      errors.push(`reactions[${i}] must be an object`);
      return;
    }
    if (typeof reaction.with !== 'string' || !FLUID_KEY.test(reaction.with)) errors.push(`reactions[${i}].with must be a fluid key`);
    else if (reaction.with === ownKey) errors.push(`reactions[${i}].with cannot be the fluid itself`);
    if (typeof reaction.becomes !== 'string' || reaction.becomes === '') errors.push(`reactions[${i}].becomes must be a block key`);
    if (!isNumber(reaction.costPerLevel) || reaction.costPerLevel <= 0) errors.push(`reactions[${i}].costPerLevel must be greater than 0`);
    if (reaction.ratePerStep !== undefined && reaction.ratePerStep !== null && !inRange(reaction.ratePerStep, 0.01, 1)) {
      errors.push(`reactions[${i}].ratePerStep must be between 0.01 and 1`);
    }
  });
  return errors;
}

/**
 * Problems with a fluid definition, one message each (empty when it is valid). The rules that keep
 * the simulation sane: levels are fractions of a full cell and rates are fractions, so a fluid can
 * always settle.
 */
export function validateFluid(fluid: Partial<FluidDefinition>): string[] {
  const errors: string[] = [];
  if (typeof fluid.typeKey !== 'string' || !FLUID_KEY.test(fluid.typeKey)) {
    errors.push('typeKey must be upper case letters, digits and underscores, starting with a letter');
  }
  if (typeof fluid.name !== 'string' || fluid.name.trim() === '') errors.push('name is required');
  if (typeof fluid.color !== 'string' || !HEX_COLOR.test(fluid.color)) errors.push('color must be a #rrggbb hex colour');
  if (!inRange(fluid.opacity, 0, 1)) errors.push('opacity must be between 0 and 1');
  if (!isNumber(fluid.density) || fluid.density <= 0) errors.push('density must be greater than 0');
  if (!inRange(fluid.viscosity, 0, 1)) errors.push('viscosity must be between 0 and 1');
  if (!isNumber(fluid.flowRate) || fluid.flowRate <= 0 || fluid.flowRate > 1) errors.push('flowRate must be above 0 and at most 1');
  if (!inRange(fluid.minLevel, 0, 1)) errors.push('minLevel must be between 0 and 1');
  if (!inRange(fluid.flowThreshold, 0, 1)) errors.push('flowThreshold must be between 0 and 1');
  errors.push(...validateFluidAppearance(fluid.appearance));
  errors.push(...validateFlammability(fluid.flammability));
  errors.push(...validateFluidGeneration(fluid.generation));
  errors.push(...validateFluidContact(fluid.contact));
  errors.push(...validateFluidLight(fluid.light));
  errors.push(...validateFluidReactions(fluid.reactions, fluid.typeKey));
  return errors;
}
