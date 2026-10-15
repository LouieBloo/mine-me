import type { Flammability } from './fluid';
import { validateFlammability, validateFluidGeneration } from './fluid';
import type { GasSoundEffectsConfig, GasSoundSlotRefs } from './sound';

/**
 * Where a gas appears when a mine is generated: sealed square pockets inside plain dirt, like fluids.
 * Null/absent on a gas means it never generates (it only arrives by other means, such as a vent).
 * Ticket 068 builds the generator on this shape.
 */
export interface GasGeneration {
  /** First row (0 = surface) pockets may start on. */
  minDepth: number;
  /** Last row a pocket may reach (null: down to the bottom of the map). */
  maxDepth?: number | null;
  /** Share of the diggable tiles in the depth range that become pocket, in percent (0-100). */
  percentage: number;
  /** Smallest and largest pocket side, in tiles. Pockets are squares. */
  minSize: number;
  maxSize: number;
  /** How full a new pocket cell is, 0 (exclusive) to 1 (absent: 1). */
  concentration?: number;
}

/**
 * How a gas looks beyond its colour: how soft its edges are and how it drifts. Stored as one Json column;
 * any missing field takes its default (`resolveGasAppearance`), so a new look setting never needs a data migration.
 */
export interface GasAppearance {
  /** How much the edge of a cloud is blurred into the air, 0 (hard cells) to 1 (very soft). */
  softness: number;
  /** How fast the cloud's texture drifts, cycles per second. */
  driftSpeed: number;
  /** How far the drift moves things, as a fraction of a cell. */
  driftAmount: number;
}

export const DEFAULT_GAS_APPEARANCE: Readonly<GasAppearance> = {
  softness: 0.6,
  driftSpeed: 0.3,
  driftAmount: 0.15,
};

/** The range each appearance setting may take (the admin form and validation share it). */
export const GAS_APPEARANCE_LIMITS: Readonly<Record<keyof GasAppearance, { min: number; max: number }>> = {
  softness: { min: 0, max: 1 },
  driftSpeed: { min: 0, max: 3 },
  driftAmount: { min: 0, max: 0.5 },
};

/** A stored appearance made whole: missing, wrong-typed or out-of-range fields fall back or clamp. */
export function resolveGasAppearance(value: unknown): GasAppearance {
  const stored = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const out = { ...DEFAULT_GAS_APPEARANCE };
  for (const key of Object.keys(GAS_APPEARANCE_LIMITS) as (keyof GasAppearance)[]) {
    const v = stored[key];
    if (typeof v === 'number' && Number.isFinite(v)) {
      const { min, max } = GAS_APPEARANCE_LIMITS[key];
      out[key] = Math.min(max, Math.max(min, v));
    }
  }
  return out;
}

/** A gas as stored in the database and sent to the game. */
export interface GasDefinition {
  id: string;
  /** Open unique key, e.g. 'HYDROGEN'. */
  typeKey: string;
  name: string;
  description?: string | null;
  /** CSS hex colour, e.g. '#bfe8ff'. */
  color: string;
  /** 0 (invisible) to 1 (opaque) at full concentration. */
  opacity: number;
  /** Relative to air = 1: below 1 the gas rises, above 1 it sinks. */
  density: number;
  /** Share of a cell's gas shared with open neighbours per simulation step, 0 to 1. */
  diffusionRate: number;
  /** A cell below this concentration is dropped. */
  minConcentration: number;
  /** Seconds gas lingers (still rising) in open-to-sky cells before it fades and despawns. */
  ventLifetime: number;
  /** Null (or absent): the default look (see `resolveGasAppearance`). */
  appearance?: Partial<GasAppearance> | null;
  /** Null (or absent): the gas is inert. Ticket 070 adds explosion settings to this shape. */
  flammability?: Flammability | null;
  /** Null (or absent): the gas is not placed in generated mines. */
  generation?: GasGeneration | null;
  /** Sound slots as stored: library sounds by id (see `resolveGasSounds`). */
  soundEffects?: GasSoundSlotRefs | null;
  /** The same slots resolved to playable urls. Filled in when definitions load; never stored. */
  sounds?: GasSoundEffectsConfig | null;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const GAS_KEY = /^[A-Z][A-Z0-9_]*$/;

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const inRange = (v: unknown, min: number, max: number): boolean => isNumber(v) && v >= min && v <= max;

/** Problems with a gas appearance value, one message each (empty when it is valid). */
export function validateGasAppearance(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (typeof value !== 'object' || Array.isArray(value)) return ['appearance must be an object or null'];
  const a = value as Record<string, unknown>;
  const errors: string[] = [];
  for (const [key, { min, max }] of Object.entries(GAS_APPEARANCE_LIMITS)) {
    if (a[key] !== undefined && !inRange(a[key], min, max)) errors.push(`appearance.${key} must be between ${min} and ${max}`);
  }
  return errors;
}

/** Problems with a gas generation value, one message each (empty when it is valid). */
export function validateGasGeneration(value: unknown): string[] {
  const errors = validateFluidGeneration(value);
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const c = (value as Record<string, unknown>).concentration;
    if (c !== undefined && c !== null && (!isNumber(c) || c <= 0 || c > 1)) {
      errors.push('generation.concentration must be above 0 and at most 1');
    }
  }
  return errors;
}

/**
 * Problems with a gas definition, one message each (empty when it is valid). The rules that keep the
 * simulation sane: concentrations are fractions of a full cell and rates are fractions, so a gas can
 * always settle or leave.
 */
export function validateGas(gas: Partial<GasDefinition>): string[] {
  const errors: string[] = [];
  if (typeof gas.typeKey !== 'string' || !GAS_KEY.test(gas.typeKey)) {
    errors.push('typeKey must be upper case letters, digits and underscores, starting with a letter');
  }
  if (typeof gas.name !== 'string' || gas.name.trim() === '') errors.push('name is required');
  if (typeof gas.color !== 'string' || !HEX_COLOR.test(gas.color)) errors.push('color must be a #rrggbb hex colour');
  if (!inRange(gas.opacity, 0, 1)) errors.push('opacity must be between 0 and 1');
  if (!isNumber(gas.density) || gas.density <= 0) errors.push('density must be greater than 0');
  if (!isNumber(gas.diffusionRate) || gas.diffusionRate <= 0 || gas.diffusionRate > 1) errors.push('diffusionRate must be above 0 and at most 1');
  if (!inRange(gas.minConcentration, 0, 1)) errors.push('minConcentration must be between 0 and 1');
  if (!isNumber(gas.ventLifetime) || gas.ventLifetime <= 0) errors.push('ventLifetime must be greater than 0');
  errors.push(...validateGasAppearance(gas.appearance));
  errors.push(...validateFlammability(gas.flammability));
  errors.push(...validateGasGeneration(gas.generation));
  return errors;
}
