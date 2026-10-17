import type { ItemLightConfig } from '../../types/index';
import type { ParticleEffectConfig } from '../../types/particles';
import type { FluidSoundEffectsConfig } from '../../types/sound';
import type { FluidAppearance } from '../../types/fluid';
import { NO_FLUID } from './FluidRegistry';

import { FLUID_UNITS } from './FluidGrid';

/** Fluid levels travel as whole units: this many per full cell (the simulation's own units, so nothing is rounded). */
export const FLUID_LEVEL_STEPS = FLUID_UNITS;

/**
 * One changed cell on the wire: [x, y, fluidId, units, falling?]. fluidId 0 / level 0 means the cell is empty. The
 * fifth value, when present, is 1: the cell's fluid is falling (the cell below can take more of it); absent means it rests.
 */
export type FluidWireCell = [x: number, y: number, fluidId: number, level: number, falling?: number];

/** What a client needs to know about a fluid to draw it (sent once per run, with the session state). */
export interface FluidClientDefinition {
  /** The id grid cells use (see FluidRegistry), not the database id. */
  id: number;
  typeKey: string;
  name: string;
  color: string;
  opacity: number;
  /** Movement speed lost at full submersion, 0 to 1 (the client predicts its own wading with this). */
  viscosity: number;
  density: number;
  /** Waves, highlight and depth shading. Absent: the defaults. */
  appearance?: FluidAppearance;
  /** What a burning cell of this fluid looks like. Absent: nothing is drawn for its fire. */
  flame?: { effect: ParticleEffectConfig | null; light: ItemLightConfig | null };
  /** The fluid's playable sounds (enter, exit, ignite, burn). Absent: silent. */
  sounds?: FluidSoundEffectsConfig;
  /** The glow the fluid always gives off (lava). Absent: none. */
  light?: ItemLightConfig;
}

/** Level (0 empty, 1 full) to its wire value, 0 to `FLUID_LEVEL_STEPS` units. Anything visible stays at least 1. */
export function quantizeFluidLevel(level: number): number {
  if (!(level > 0)) return 0;
  return Math.min(FLUID_LEVEL_STEPS, Math.max(1, Math.round(level * FLUID_LEVEL_STEPS)));
}

/** Wire value back to a level. */
export function dequantizeFluidLevel(quantised: number): number {
  return quantised / FLUID_LEVEL_STEPS;
}

/** Builds the wire form of a cell's contents (the falling flag is left off when the fluid rests). Any `falling` above 0 means falling. */
export function toFluidWireCell(x: number, y: number, fluidId: number, level: number, falling = 0): FluidWireCell {
  const q = quantizeFluidLevel(level);
  return q > 0 && falling > 0 ? [x, y, fluidId, q, 1] : [x, y, q > 0 ? fluidId : NO_FLUID, q];
}

/**
 * The fluid in the cells a client can see, kept as the server tells it: a full snapshot once, then
 * changed cells. Drawing reads from here. Out-of-range cells are ignored, so a bad message cannot throw.
 */
export class FluidField {
  private readonly ids: Uint8Array;
  private readonly levels: Uint8Array;
  private readonly falling: Uint8Array;

  public readonly width: number;
  public readonly height: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.ids = new Uint8Array(width * height);
    this.levels = new Uint8Array(width * height);
    this.falling = new Uint8Array(width * height);
  }

  private index(x: number, y: number): number {
    return x >= 0 && y >= 0 && x < this.width && y < this.height && Number.isInteger(x) && Number.isInteger(y)
      ? y * this.width + x
      : -1;
  }

  /** Sets one cell (`quantisedFalling`: any value above 0 means its fluid is falling). Returns whether anything changed. */
  public set(x: number, y: number, fluidId: number, quantised: number, quantisedFalling = 0): boolean {
    const i = this.index(x, y);
    if (i < 0) return false;
    const id = quantised > 0 ? fluidId : NO_FLUID;
    const level = quantised > 0 ? Math.min(FLUID_LEVEL_STEPS, quantised) : 0;
    const falling = level > 0 && quantisedFalling > 0 ? 1 : 0;
    if (this.ids[i] === id && this.levels[i] === level && this.falling[i] === falling) return false;
    this.ids[i] = id;
    this.levels[i] = level;
    this.falling[i] = falling;
    return true;
  }

  /** Applies wire cells; returns the ones that actually changed something. */
  public apply(cells: readonly FluidWireCell[]): FluidWireCell[] {
    const changed: FluidWireCell[] = [];
    for (const cell of cells) {
      if (this.set(cell[0], cell[1], cell[2], cell[3], cell[4] ?? 0)) changed.push(cell);
    }
    return changed;
  }

  /** The cell's level while its fluid is falling, 0 when it rests. */
  public getFalling(x: number, y: number): number {
    const i = this.index(x, y);
    return i < 0 || this.falling[i] === 0 ? 0 : dequantizeFluidLevel(this.levels[i]);
  }

  /** Whether the cell's fluid is falling (the cell below can take more of it). */
  public isFalling(x: number, y: number): boolean {
    const i = this.index(x, y);
    return i >= 0 && this.falling[i] === 1 && this.levels[i] > 0;
  }

  public getFluidId(x: number, y: number): number {
    const i = this.index(x, y);
    return i < 0 ? NO_FLUID : this.ids[i];
  }

  /** Level of the cell, 0 (empty) to 1 (full). */
  public getLevel(x: number, y: number): number {
    const i = this.index(x, y);
    return i < 0 ? 0 : dequantizeFluidLevel(this.levels[i]);
  }
}
