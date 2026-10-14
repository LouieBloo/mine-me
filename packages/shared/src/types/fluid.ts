import type { ItemLightConfig } from './index';
import type { FluidSoundEffectsConfig, FluidSoundSlotRefs } from './sound';

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
}

/**
 * Where a fluid appears when a mine is generated: sealed square pockets of full cells inside plain
 * dirt. Null/absent on a fluid means it never generates (it only arrives by other means).
 */
export interface FluidGeneration {
  /** First row (0 = surface) pockets may start on. */
  minDepth: number;
  /** Last row a pocket may reach (null: down to the bottom of the map). */
  maxDepth?: number | null;
  /** Share of the diggable tiles in the depth range that become pocket, in percent (0-100). */
  percentage: number;
  /** Smallest and largest pocket side, in tiles. Pockets are squares. */
  minSize: number;
  maxSize: number;
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
  /** Null (or absent): the fluid does not burn. */
  flammability?: Flammability | null;
  /** Null (or absent): the fluid is not placed in generated mines. */
  generation?: FluidGeneration | null;
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
  errors.push(...validateFlammability(fluid.flammability));
  errors.push(...validateFluidGeneration(fluid.generation));
  return errors;
}
