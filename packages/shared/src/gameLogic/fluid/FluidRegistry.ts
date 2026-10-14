import type { FluidDefinition } from '../../types/fluid';

/** The parts of a fluid definition the simulation reads. */
export type FluidParams = Pick<FluidDefinition, 'typeKey' | 'density' | 'flowRate' | 'minLevel' | 'flowThreshold'> &
  Partial<Pick<FluidDefinition, 'viscosity'>>;

/** Id stored in a grid cell that holds no fluid. */
export const NO_FLUID = 0;

/**
 * Maps fluid typeKeys to the small numbers a grid cell stores (1..255; 0 is "no fluid") and back.
 * Ids are handed out in typeKey order, so the same set of fluids always gets the same numbers,
 * whatever order the database returns them in.
 */
export class FluidRegistry {
  private readonly byId: FluidParams[] = [];
  private readonly idByKey = new Map<string, number>();

  constructor(definitions: readonly FluidParams[]) {
    const sorted = [...definitions].sort((a, b) => (a.typeKey < b.typeKey ? -1 : a.typeKey > b.typeKey ? 1 : 0));
    for (const def of sorted) {
      if (this.idByKey.has(def.typeKey)) continue;
      if (this.byId.length >= 255) throw new Error('A grid cell can hold at most 255 different fluids');
      this.byId.push(def);
      this.idByKey.set(def.typeKey, this.byId.length);
    }
  }

  /** Cell id for a fluid typeKey, or undefined if there is no such fluid. */
  public idOf(typeKey: string): number | undefined {
    return this.idByKey.get(typeKey);
  }

  /** The fluid a cell id stands for (undefined for NO_FLUID or an unknown id). */
  public paramsOf(id: number): FluidParams | undefined {
    return this.byId[id - 1];
  }

  /** typeKey for a cell id. */
  public keyOf(id: number): string | undefined {
    return this.byId[id - 1]?.typeKey;
  }

  public get size(): number {
    return this.byId.length;
  }
}
