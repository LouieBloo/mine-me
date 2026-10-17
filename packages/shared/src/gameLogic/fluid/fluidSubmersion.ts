import { isFluidCovered } from './fluidCover';

/** Anything that can say what fluid is in a cell: the server's `FluidGrid` and the client's `FluidField`. */
export interface FluidSampler {
  getFluidId(x: number, y: number): number;
  getLevel(x: number, y: number): number;
}

/** What movement and forces need to know about a fluid. */
export interface FluidBodyProperties {
  /** Movement speed lost at full submersion, 0 to 1. */
  viscosity: number;
  density: number;
}

/** The fluid around a body: where it is and how to look up a fluid's properties by its cell id. */
export interface FluidEnvironment {
  sampler: FluidSampler;
  propertiesOf(fluidId: number): FluidBodyProperties | undefined;
}

/** How deep in one fluid a body is. */
export interface FluidContact {
  fluidId: number;
  /** Fraction of the body's height that is in the fluid, 0 to 1 (averaged across the columns it covers). */
  submerged: number;
}

const EDGE = 1e-4;

/**
 * Finds the fluid a body (a box centred on cx, cy) is standing in or sinking into. A cell's fluid fills it
 * from the bottom up to its level, or all of it when the same fluid is above (the same rule the game draws
 * with, so what you see is what slows you). When several fluids touch the body, the deepest one wins.
 * Returns null when the body is dry.
 */
export function sampleFluidContact(
  sampler: FluidSampler,
  cx: number,
  cy: number,
  halfWidth: number,
  halfHeight: number
): FluidContact | null {
  const top = cy - halfHeight;
  const bottom = cy + halfHeight;
  const firstColumn = Math.floor(cx - halfWidth + EDGE);
  const lastColumn = Math.floor(cx + halfWidth - EDGE);
  const firstRow = Math.floor(top + EDGE);
  const lastRow = Math.floor(bottom - EDGE);
  const columns = lastColumn - firstColumn + 1;
  const height = bottom - top;
  if (columns < 1 || height <= 0) return null;

  const covered = new Map<number, number>();
  for (let x = firstColumn; x <= lastColumn; x++) {
    for (let y = firstRow; y <= lastRow; y++) {
      const fluidId = sampler.getFluidId(x, y);
      if (fluidId === 0) continue;
      const full = isFluidCovered(sampler, x, y);
      const fill = full ? 1 : Math.min(1, sampler.getLevel(x, y));
      const fluidTop = y + 1 - fill;
      const overlap = Math.min(bottom, y + 1) - Math.max(top, fluidTop);
      if (overlap > 0) covered.set(fluidId, (covered.get(fluidId) ?? 0) + overlap);
    }
  }

  let best: FluidContact | null = null;
  for (const [fluidId, length] of covered) {
    const submerged = Math.min(1, length / (height * columns));
    if (submerged > 0 && (!best || submerged > best.submerged)) best = { fluidId, submerged };
  }
  return best;
}

/** Speed multiplier for something wading through a fluid: 1 when dry, 0 when the fluid is too thick to move in. */
export function fluidMovementFactor(viscosity: number, submerged: number): number {
  const factor = 1 - viscosity * submerged;
  return Math.min(1, Math.max(0, Number.isFinite(factor) ? factor : 1));
}

/** The speed multiplier at a position, or 1 with no fluid environment or no fluid there. */
export function movementFactorAt(
  environment: FluidEnvironment | null | undefined,
  cx: number,
  cy: number,
  halfWidth: number,
  halfHeight: number
): number {
  if (!environment) return 1;
  const contact = sampleFluidContact(environment.sampler, cx, cy, halfWidth, halfHeight);
  if (!contact) return 1;
  const properties = environment.propertiesOf(contact.fluidId);
  return properties ? fluidMovementFactor(properties.viscosity, contact.submerged) : 1;
}

/** A body crossing the surface of a fluid. */
export interface FluidCrossing {
  kind: 'enter' | 'exit';
  fluidId: number;
}

/**
 * Works out whether a body just waded into or climbed out of a fluid, with some give so it does not splash over
 * and over while it bobs at the surface: it counts as in a fluid once it is `enterDepth` deep, and as out once it
 * is shallower than `exitDepth` (which should be smaller). Moving straight from one fluid into another is an
 * exit and an enter. `current` is the fluid it was in (0 for none); returns the fluid it is in now and what happened.
 */
export function crossFluidSurface(
  current: number,
  contact: FluidContact | null,
  enterDepth: number,
  exitDepth: number
): { fluidId: number; crossings: FluidCrossing[] } {
  const crossings: FluidCrossing[] = [];
  let fluidId = current;
  const leaves = fluidId !== 0 && (!contact || contact.fluidId !== fluidId || contact.submerged < exitDepth);
  if (leaves) {
    crossings.push({ kind: 'exit', fluidId });
    fluidId = 0;
  }
  if (fluidId === 0 && contact && contact.submerged >= enterDepth) {
    crossings.push({ kind: 'enter', fluidId: contact.fluidId });
    fluidId = contact.fluidId;
  }
  return { fluidId, crossings };
}
