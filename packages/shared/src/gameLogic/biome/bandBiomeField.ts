import { BiomeField } from './biomeField';
import type { BiomeDefinition } from '../../types/biome';

/**
 * A biome field laid out by hand instead of by noise, for the sandbox (ticket 142): the biomes stand side by side in
 * equal vertical bands, left to right (the default first, then by the depth they start at). Every row below the
 * sky belongs to the band of its column; the sky is the default biome. Where two bands meet the shares cross over
 * linearly across `blendCells` cells, so a border mixes both biomes exactly as a generated border does (everything
 * that reads the field - swaps, mixes, the per-cell primary biome - goes through `weightsAt`).
 */
export class BandBiomeField extends BiomeField {
  /** The biome index of each band, left to right. */
  public readonly bandOrder: readonly number[];
  private readonly bandWidth: number;
  private readonly blendCells: number;
  private readonly skyRows: number;

  constructor(biomes: readonly BiomeDefinition[] | undefined, width: number, height: number, skyRows: number, blendCells: number) {
    super(0, biomes, 0, width, height);
    const order = this.biomes
      .map((b, index) => ({ b, index }))
      .sort((a, b) => Number(b.b.isDefault) - Number(a.b.isDefault) || a.b.minDepth - b.b.minDepth || (a.b.key < b.b.key ? -1 : 1));
    this.bandOrder = order.map((o) => o.index);
    this.bandWidth = width / this.bandOrder.length;
    // A border can be no wider than a band, or three bands would overlap
    this.blendCells = Math.max(0, Math.min(blendCells, this.bandWidth));
    this.skyRows = skyRows;
  }

  /** Where band `k` starts (and band `k - 1` ends), in cells. */
  public bandStart(k: number): number {
    return k * this.bandWidth;
  }

  /** How far past the border that starts band `k` the cell is: 0 before it, 1 after it, 0.5 on it. */
  private pastBorder(k: number, x: number): number {
    if (k <= 0) return 1;
    if (k >= this.bandOrder.length) return 0;
    if (this.blendCells <= 0) return x + 0.5 >= this.bandStart(k) ? 1 : 0;
    return Math.min(1, Math.max(0, 0.5 + (x + 0.5 - this.bandStart(k)) / this.blendCells));
  }

  public override weightsAt(x: number, mapY: number): readonly number[] {
    const out = this.biomes.map(() => 0);
    if (mapY < this.skyRows || x < 0 || x >= this.width) {
      out[this.defaultIndex] = 1;
      return out;
    }
    this.bandOrder.forEach((biomeIndex, k) => {
      out[biomeIndex] = this.pastBorder(k, x) - this.pastBorder(k + 1, x);
    });
    return out;
  }
}
