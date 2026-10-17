/** What the cover rule reads: which fluid is in a cell. */
export interface FluidIdSampler {
  getFluidId(x: number, y: number): number;
}

/**
 * Whether the same fluid is directly above a cell. Fluid under fluid is a full cell tall, whatever its level (the
 * level only says how much is in the cell, and fluid above it is pressing it full). One rule for the drawing and for
 * how deep something sinks, so what looks submerged is submerged.
 */
export function isFluidCovered(sampler: FluidIdSampler, x: number, y: number): boolean {
  const id = sampler.getFluidId(x, y);
  return id !== 0 && sampler.getFluidId(x, y - 1) === id;
}
