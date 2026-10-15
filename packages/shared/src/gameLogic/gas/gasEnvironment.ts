/** Anything that can say what gas is in a cell: the server's `GasGrid` and the client's `GasField`. */
export interface GasSampler {
  getGasId(x: number, y: number): number;
  getConcentration(x: number, y: number): number;
}

/** What a body needs to know about a gas. Gas does nothing to bodies yet; this is where suffocation or slowdown will read from. */
export interface GasBodyProperties {
  density: number;
}

/** The gas around a body: where it is and how to look up a gas's properties by its cell id. */
export interface GasEnvironment {
  sampler: GasSampler;
  propertiesOf(gasId: number): GasBodyProperties | undefined;
}

/** The gas a body is standing in. */
export interface GasContact {
  gasId: number;
  /** How thick the gas is around the body, 0 to 1 (averaged over the cells the body covers, by how much of the body is in each). */
  concentration: number;
}

/**
 * Finds the gas around a body (a box centred on cx, cy). Each cell the body overlaps contributes its
 * concentration in proportion to how much of the body is in it; when several gases touch the body the
 * thickest wins. Returns null when the body is in clear air.
 */
export function sampleGasContact(sampler: GasSampler, cx: number, cy: number, halfWidth: number, halfHeight: number): GasContact | null {
  const left = cx - halfWidth;
  const right = cx + halfWidth;
  const top = cy - halfHeight;
  const bottom = cy + halfHeight;
  const area = (right - left) * (bottom - top);
  if (!(area > 0)) return null;
  const total = new Map<number, number>();
  for (let y = Math.floor(top); y <= Math.floor(bottom - 1e-9); y++) {
    for (let x = Math.floor(left); x <= Math.floor(right - 1e-9); x++) {
      const gasId = sampler.getGasId(x, y);
      if (gasId === 0) continue;
      const overlap = (Math.min(right, x + 1) - Math.max(left, x)) * (Math.min(bottom, y + 1) - Math.max(top, y));
      if (overlap <= 0) continue;
      total.set(gasId, (total.get(gasId) ?? 0) + (overlap / area) * sampler.getConcentration(x, y));
    }
  }
  let best: GasContact | null = null;
  for (const [gasId, concentration] of total) {
    if (concentration > 0 && (!best || concentration > best.concentration)) best = { gasId, concentration: Math.min(1, concentration) };
  }
  return best;
}
