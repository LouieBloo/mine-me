import type { FluidDefinition } from '../../types/fluid';
import { CellIdRegistry } from '../CellIdRegistry';

/** The parts of a fluid definition the simulation reads. */
export type FluidParams = Pick<FluidDefinition, 'typeKey' | 'density' | 'flowRate'> &
  Partial<Pick<FluidDefinition, 'viscosity' | 'reactions' | 'minLevel' | 'flowThreshold'>>;

/** Id stored in a grid cell that holds no fluid. */
export const NO_FLUID = 0;

/** Maps fluid typeKeys to the small numbers a fluid grid cell stores (1..255; 0 is "no fluid") and back. */
export class FluidRegistry extends CellIdRegistry<FluidParams> {
  constructor(definitions: readonly FluidParams[]) {
    super(definitions, 'fluids');
  }
}
