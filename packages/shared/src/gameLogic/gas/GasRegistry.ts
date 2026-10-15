import type { GasDefinition } from '../../types/gas';
import { CellIdRegistry } from '../CellIdRegistry';

/** The parts of a gas definition the simulation reads. */
export type GasParams = Pick<GasDefinition, 'typeKey' | 'density' | 'diffusionRate' | 'minConcentration' | 'ventLifetime'>;

/** Id stored in a grid cell that holds no gas. */
export const NO_GAS = 0;

/** Maps gas typeKeys to the small numbers a gas grid cell stores (1..255; 0 is "no gas") and back. */
export class GasRegistry extends CellIdRegistry<GasParams> {
  constructor(definitions: readonly GasParams[]) {
    super(definitions, 'gases');
  }
}
