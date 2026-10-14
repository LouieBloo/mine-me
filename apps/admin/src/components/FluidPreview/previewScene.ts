import { FluidField, FluidGrid, FluidRegistry, toFluidWireCell, type FluidParams } from '@mine-me/shared';

export const PREVIEW_WIDTH = 24;
export const PREVIEW_HEIGHT = 12;

/** The tank: '#' is solid. A shelf under the spout makes the pour split; the wall between the chambers has a gate low down that can be opened. */
const LAYOUT = [
  '########################',
  '#...........#..........#',
  '#...........#..........#',
  '#...........#..........#',
  '#...........#..........#',
  '#....#####..#..........#',
  '#...........#..........#',
  '#...........#..........#',
  '#...........#..........#',
  '#...........#..........#',
  '#...........#..........#',
  '########################',
];
const DIVIDER_X = 12;
/** The rows of the wall that open: a gate at the bottom, so fluid already pooled behind it runs through. */
const DIVIDER_Y = [8, 9, 10];
const SPOUT = { x: 6, y: 1 };
/** Fluid added per simulation step while pouring (a fraction of a full cell). */
export const POUR_RATE = 0.5;

const PREVIEW_KEY = 'PREVIEW';

/** What the simulation needs from a fluid being edited. */
export type PreviewFluid = Pick<FluidParams, 'density' | 'flowRate' | 'minLevel' | 'flowThreshold'>;

/**
 * A small tank running the real shared `FluidGrid` with the fluid's settings, so tuning flow rate and
 * minimum level in the admin shows exactly what the game will do. Pure logic with no drawing, so it can
 * be tested without a canvas.
 */
export class PreviewScene {
  private grid: FluidGrid;
  private readonly solid: boolean[][];
  private readonly fluid: PreviewFluid;
  public pouring = false;
  public dividerOpen = false;

  constructor(fluid: PreviewFluid) {
    this.fluid = fluid;
    this.solid = LAYOUT.map((row) => row.split('').map((c) => c === '#'));
    this.grid = this.buildGrid();
  }

  private buildGrid(): FluidGrid {
    const registry = new FluidRegistry([{ typeKey: PREVIEW_KEY, ...this.fluid }]);
    return new FluidGrid(PREVIEW_WIDTH, PREVIEW_HEIGHT, registry, (x, y) => this.solid[y][x]);
  }

  public isSolid(x: number, y: number): boolean {
    return this.solid[y]?.[x] ?? true;
  }

  /** One simulation step (what the game does every few ticks). */
  public step(): void {
    if (this.pouring) this.grid.addFluid(SPOUT.x, SPOUT.y, 1, POUR_RATE);
    this.grid.step();
  }

  public setPouring(pouring: boolean): void {
    this.pouring = pouring;
  }

  /** Takes out the divider wall, the way mining a block would, so the fluid beside it can flow. */
  public openDivider(): void {
    if (this.dividerOpen) return;
    this.dividerOpen = true;
    for (const y of DIVIDER_Y) {
      this.solid[y][DIVIDER_X] = false;
      this.grid.onTileChanged(DIVIDER_X, y);
    }
  }

  /** Back to an empty tank with the divider in place. */
  public reset(): void {
    this.pouring = false;
    this.dividerOpen = false;
    for (const y of DIVIDER_Y) this.solid[y][DIVIDER_X] = true;
    this.grid = this.buildGrid();
  }

  /** The fluid as a client would receive it, so the preview draws through the same code as the game. */
  public toField(): FluidField {
    const field = new FluidField(PREVIEW_WIDTH, PREVIEW_HEIGHT);
    for (let y = 0; y < PREVIEW_HEIGHT; y++) {
      for (let x = 0; x < PREVIEW_WIDTH; x++) {
        const id = this.grid.getFluidId(x, y);
        if (id !== 0) field.apply([toFluidWireCell(x, y, id, this.grid.getLevel(x, y))]);
      }
    }
    return field;
  }

  public stats(): { volume: number; evaporated: number; activeCells: number } {
    return { volume: this.grid.totalVolume(), evaporated: this.grid.evaporatedVolume, activeCells: this.grid.activeCount };
  }
}
