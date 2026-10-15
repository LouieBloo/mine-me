import type { GasAppearance } from '../../types/gas';
import type { GasSoundEffectsConfig } from '../../types/sound';
import type { ItemLightConfig } from '../../types/index';
import type { ParticleEffectConfig } from '../../types/particles';
import { NO_GAS } from './GasRegistry';

/** Gas concentrations travel as whole numbers: this many steps per full cell. */
export const GAS_CONCENTRATION_STEPS = 255;

/** One changed cell on the wire: [x, y, gasId, quantised concentration]. gasId 0 / concentration 0 means the cell is empty. */
export type GasWireCell = [x: number, y: number, gasId: number, concentration: number];

/** What a client needs to know about a gas to draw and hear it (sent once per run, with the session state). */
export interface GasClientDefinition {
  /** The id grid cells use (see GasRegistry), not the database id. */
  id: number;
  typeKey: string;
  name: string;
  color: string;
  opacity: number;
  density: number;
  /** Edge softness and drift. Absent: the defaults. */
  appearance?: GasAppearance;
  /** The gas's playable sounds. Absent: silent. */
  sounds?: GasSoundEffectsConfig;
  /** What a cell of this gas looks like as it detonates (an explosive gas only). Absent: nothing is drawn. */
  explosion?: { effect: ParticleEffectConfig | null; light: ItemLightConfig | null };
}

/**
 * Something about gas worth a sound, at a position in tiles. `enter`/`exit`: a player or mob walked into or out of a cloud;
 * `ignite`: explosive gas was set alight; `vent`: gas started escaping into the open air (a roof was broken).
 */
export interface GasEvent {
  kind: 'enter' | 'exit' | 'ignite' | 'vent';
  /** The gas's cell id (see `GasClientDefinition`). */
  gasId: number;
  x: number;
  y: number;
}

/** One cell of gas that detonated this tick, as [x, y, gasId]. */
export type GasExplosionCell = [x: number, y: number, gasId: number];

/** Concentration (0 empty, 1 full) to its wire value, 0-255. Anything present stays at least 1. */
export function quantizeGasConcentration(concentration: number): number {
  if (!(concentration > 0)) return 0;
  return Math.min(GAS_CONCENTRATION_STEPS, Math.max(1, Math.round(concentration * GAS_CONCENTRATION_STEPS)));
}

/** Wire value back to a concentration. */
export function dequantizeGasConcentration(quantised: number): number {
  return quantised / GAS_CONCENTRATION_STEPS;
}

/** Builds the wire form of a cell's contents. */
export function toGasWireCell(x: number, y: number, gasId: number, concentration: number): GasWireCell {
  const q = quantizeGasConcentration(concentration);
  return [x, y, q > 0 ? gasId : NO_GAS, q];
}

/**
 * The gas in the cells a client can see, kept as the server tells it: a full snapshot once, then changed
 * cells. Drawing and the player's predicted body read from here. Out-of-range cells are ignored, so a bad
 * message cannot throw.
 */
export class GasField {
  private readonly ids: Uint8Array;
  private readonly levels: Uint8Array;

  public readonly width: number;
  public readonly height: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.ids = new Uint8Array(width * height);
    this.levels = new Uint8Array(width * height);
  }

  private index(x: number, y: number): number {
    return x >= 0 && y >= 0 && x < this.width && y < this.height && Number.isInteger(x) && Number.isInteger(y)
      ? y * this.width + x
      : -1;
  }

  /** Sets one cell. Returns whether anything changed. */
  public set(x: number, y: number, gasId: number, quantised: number): boolean {
    const i = this.index(x, y);
    if (i < 0) return false;
    const id = quantised > 0 ? gasId : NO_GAS;
    const level = quantised > 0 ? Math.min(GAS_CONCENTRATION_STEPS, quantised) : 0;
    if (this.ids[i] === id && this.levels[i] === level) return false;
    this.ids[i] = id;
    this.levels[i] = level;
    return true;
  }

  /** Applies wire cells; returns the ones that actually changed something. */
  public apply(cells: readonly GasWireCell[]): GasWireCell[] {
    const changed: GasWireCell[] = [];
    for (const cell of cells) {
      if (this.set(cell[0], cell[1], cell[2], cell[3])) changed.push(cell);
    }
    return changed;
  }

  public getGasId(x: number, y: number): number {
    const i = this.index(x, y);
    return i < 0 ? NO_GAS : this.ids[i];
  }

  /** Concentration of the cell, 0 to 1. */
  public getConcentration(x: number, y: number): number {
    const i = this.index(x, y);
    return i < 0 ? 0 : dequantizeGasConcentration(this.levels[i]);
  }
}
