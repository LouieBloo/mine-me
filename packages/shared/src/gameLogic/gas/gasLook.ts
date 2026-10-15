/** Gas thinner than this is not drawn (the faint traces left in dead ends are not worth a shape). */
export const GAS_VISIBLE_MIN = 0.03;

/** How opaque a cell of gas is drawn: the gas's opacity at full concentration, less as it thins. */
export function gasCellAlpha(opacity: number, concentration: number): number {
  return Math.min(1, Math.max(0, opacity)) * Math.min(1, Math.max(0, concentration));
}

/** Radius of the soft blob drawn for a cell, in tiles: half a tile for hard-edged gas, growing into its neighbours as it gets softer. */
export function gasBlobRadius(softness: number): number {
  return 0.5 + 0.45 * Math.min(1, Math.max(0, softness));
}

/** A cell's small, repeatable offset in a 0..1 phase, so neighbouring cells drift out of step. */
export function gasDriftPhase(x: number, y: number): number {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

/** One of the stacked circles that make up a soft cell: its radius as a share of the full blob, and its share of the cell's alpha. */
export const GAS_BLOB_LAYERS: ReadonlyArray<{ radius: number; alpha: number }> = [
  { radius: 1, alpha: 0.35 },
  { radius: 0.78, alpha: 0.4 },
  { radius: 0.5, alpha: 0.4 },
];

/** Where a cell's blob is centred at `timeSec`, in tiles, drifting around the cell's middle. */
export function gasBlobCentre(x: number, y: number, timeSec: number, driftSpeed: number, driftAmount: number): { x: number; y: number } {
  const t = timeSec * driftSpeed * Math.PI * 2 + gasDriftPhase(x, y) * Math.PI * 2;
  return { x: x + 0.5 + Math.sin(t) * driftAmount, y: y + 0.5 + Math.cos(t * 0.8) * driftAmount };
}
