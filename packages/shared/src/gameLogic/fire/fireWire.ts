/** One cell whose fire started (1) or stopped (0), on the wire: [x, y, burning]. */
export type FireWireCell = [x: number, y: number, burning: 0 | 1];

/**
 * Which of the cells a client can see are on fire, kept as the server tells it: a full snapshot once, then
 * the cells that started or stopped burning. Drawing and lighting read from here. Out-of-range cells are
 * ignored, so a bad message cannot throw.
 */
export class FireField {
  public readonly width: number;
  public readonly height: number;
  private readonly burning: Uint8Array;
  private count = 0;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.burning = new Uint8Array(width * height);
  }

  private index(x: number, y: number): number {
    return x >= 0 && y >= 0 && x < this.width && y < this.height && Number.isInteger(x) && Number.isInteger(y) ? y * this.width + x : -1;
  }

  /** Sets one cell. Returns whether anything changed. */
  public set(x: number, y: number, isBurning: boolean): boolean {
    const i = this.index(x, y);
    if (i < 0) return false;
    const next = isBurning ? 1 : 0;
    if (this.burning[i] === next) return false;
    this.burning[i] = next;
    this.count += next ? 1 : -1;
    return true;
  }

  /** Applies wire cells; returns the ones that actually changed something. */
  public apply(cells: readonly FireWireCell[]): FireWireCell[] {
    const changed: FireWireCell[] = [];
    for (const cell of cells) {
      if (this.set(cell[0], cell[1], cell[2] === 1)) changed.push(cell);
    }
    return changed;
  }

  public isBurning(x: number, y: number): boolean {
    const i = this.index(x, y);
    return i >= 0 && this.burning[i] === 1;
  }

  public get burningCount(): number {
    return this.count;
  }

  /** Visits every burning cell. */
  public forEachBurning(visit: (x: number, y: number) => void): void {
    for (let i = 0; i < this.burning.length; i++) {
      if (this.burning[i]) visit(i % this.width, Math.floor(i / this.width));
    }
  }
}
