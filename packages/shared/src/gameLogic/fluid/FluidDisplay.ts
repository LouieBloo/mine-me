/** What drawing needs to read fluid: the grid size and each cell's fluid and level. `FluidField` and `FluidDisplay` both are. */
export interface FluidLevels {
  readonly width: number;
  readonly height: number;
  getFluidId(x: number, y: number): number;
  getLevel(x: number, y: number): number;
  /** The cell's level while its fluid is falling (the cell below can take more of it), 0 when it rests. Absent: nothing is known to fall. */
  getFalling?(x: number, y: number): number;
  /** Whether the cell's fluid is falling. Absent: nothing is known to fall. */
  isFalling?(x: number, y: number): boolean;
}

/** Seconds for the drawn level to cover about two thirds of the way to a new level. */
export const FLUID_DISPLAY_EASE_SECONDS = 0.12;
/** Closer than this to its target and a cell snaps to it and stops moving. */
const SETTLE = 0.004;

/**
 * The fluid as it is drawn: the levels the server sends, eased over a moment instead of jumping. The fluid
 * steps 10 times a second and its cells pulse from step to step (a falling stream hands its fluid down in
 * beats), which drawn directly is jerky and flickers; eased, it flows. Only drawing reads this: bodies, sounds
 * and fire keep using the exact levels. Pure and clock-free (the caller passes the time step) so it can be tested.
 */
export class FluidDisplay implements FluidLevels {
  public readonly width: number;
  public readonly height: number;
  private readonly ids: Uint8Array;
  private readonly levels: Float64Array;
  private readonly targetIds: Uint8Array;
  private readonly targets: Float64Array;
  /** Whether each cell's fluid is falling, as the server last said (not eased: it is applied at once). */
  private readonly falling: Float64Array;
  private readonly moving = new Set<number>();
  private readonly easeSeconds: number;

  constructor(width: number, height: number, easeSeconds: number = FLUID_DISPLAY_EASE_SECONDS) {
    this.width = width;
    this.height = height;
    this.easeSeconds = easeSeconds;
    this.ids = new Uint8Array(width * height);
    this.levels = new Float64Array(width * height);
    this.targetIds = new Uint8Array(width * height);
    this.targets = new Float64Array(width * height);
    this.falling = new Float64Array(width * height);
  }

  private index(x: number, y: number): number {
    return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < this.width && y < this.height ? y * this.width + x : -1;
  }

  public getFluidId(x: number, y: number): number {
    const i = this.index(x, y);
    return i < 0 ? 0 : this.ids[i];
  }

  public getLevel(x: number, y: number): number {
    const i = this.index(x, y);
    return i < 0 ? 0 : this.levels[i];
  }

  /** The cell's drawn level while its fluid is falling, 0 when it rests. */
  public getFalling(x: number, y: number): number {
    const i = this.index(x, y);
    return i < 0 || !(this.falling[i] > 0) ? 0 : this.levels[i];
  }

  /** Whether the cell's fluid is falling. */
  public isFalling(x: number, y: number): boolean {
    const i = this.index(x, y);
    return i >= 0 && this.falling[i] > 0 && this.levels[i] > 0;
  }

  /** Cells still easing towards their level. */
  public get movingCount(): number {
    return this.moving.size;
  }

  /** Shows a cell's contents straight away (fluid that came into view, or the first snapshot). Returns whether anything changed. */
  public setNow(x: number, y: number, fluidId: number, level: number, falling = 0): boolean {
    const i = this.index(x, y);
    if (i < 0) return false;
    this.falling[i] = level > 0 && falling > 0 ? 1 : 0;
    const id = level > 0 ? fluidId : 0;
    const lv = level > 0 ? level : 0;
    this.targetIds[i] = id;
    this.targets[i] = lv;
    this.moving.delete(i);
    if (this.ids[i] === id && this.levels[i] === lv) return false;
    this.ids[i] = id;
    this.levels[i] = lv;
    return true;
  }

  /**
   * A cell's new contents, eased towards. Shown straight away instead: a different fluid replacing another, and fluid
   * falling or that was falling (a falling cell is drawn as a whole column, so easing it would show it fading out of
   * one cell and into the next). Returns whether what is drawn changed straight away (a snap, or a cell that started or
   * stopped falling), so the caller can redraw it; easing shows up in `step`.
   */
  public setTarget(x: number, y: number, fluidId: number, level: number, falling = 0): boolean {
    const i = this.index(x, y);
    if (i < 0) return false;
    const id = level > 0 ? fluidId : 0;
    this.targetIds[i] = id;
    this.targets[i] = level > 0 ? level : 0;
    const wasFalling = this.falling[i] > 0;
    const flagChanged = wasFalling !== (level > 0 && falling > 0);
    this.falling[i] = level > 0 && falling > 0 ? 1 : 0;
    if ((id !== 0 && this.ids[i] !== 0 && this.ids[i] !== id) || falling > 0 || (wasFalling && level <= 0)) {
      const shown = this.setNow(x, y, id, level, falling);
      return shown || flagChanged;
    }
    if (id !== 0 && this.ids[i] === 0) this.ids[i] = id; // fluid arriving in an empty cell grows from nothing
    this.moving.add(i);
    return flagChanged;
  }

  /** Moves every easing cell on by `dtSec`. Returns the cells that changed, as [x, y] pairs. */
  public step(dtSec: number): Array<[number, number]> {
    const changed: Array<[number, number]> = [];
    if (this.moving.size === 0) return changed;
    for (const i of this.moving) {
      const target = this.targets[i];
      const t = dtSec > 0 ? 1 - Math.exp(-dtSec / this.easeSeconds) : 0;
      let level = this.levels[i] + (target - this.levels[i]) * t;
      if (Math.abs(target - level) < SETTLE) {
        level = target;
        this.moving.delete(i);
      }
      if (level === this.levels[i]) continue;
      this.levels[i] = level;
      // Draining away keeps its fluid until it is gone
      this.ids[i] = level > 0 ? this.targetIds[i] || this.ids[i] : 0;
      changed.push([i % this.width, Math.floor(i / this.width)]);
    }
    return changed;
  }
}
