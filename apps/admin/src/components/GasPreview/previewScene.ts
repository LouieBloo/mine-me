import { GasGrid, GasRegistry, type GasParams } from '@mine-me/shared';

export const PREVIEW_WIDTH = 24;
export const PREVIEW_HEIGHT = 14;

/**
 * The box: '#' is solid. A shelf above the spout makes light gas pool under it and creep out to its edge, and the roof has a gate
 * (at VENT) that can be opened to the sky, so the gas can be watched rising out and fading away.
 */
const LAYOUT = [
  '########################',
  '#......................#',
  '#......................#',
  '#......................#',
  '#......................#',
  '#......................#',
  '#.....########.........#',
  '#......................#',
  '#......................#',
  '#......................#',
  '#......................#',
  '#......................#',
  '#......................#',
  '########################',
];
/** The gate in the roof, and the spout at the foot of the box. */
export const VENT = { x: 14, y: 0 };
export const SPOUT = { x: 10, y: 12 };
/** Gas added per simulation step while releasing (a fraction of a full cell). */
export const RELEASE_RATE = 0.5;

const PREVIEW_KEY = 'PREVIEW';

/** What the simulation needs from a gas being edited. */
export type PreviewGas = Pick<GasParams, 'density' | 'diffusionRate' | 'minConcentration' | 'ventLifetime'>;

/**
 * A small box running the real shared `GasGrid` with the gas's settings, so tuning density and spread in the
 * admin shows what the game will do. Pure logic with no drawing, so it can be tested without a canvas.
 */
export class PreviewScene {
  private grid: GasGrid;
  private readonly solid: boolean[][];
  private readonly gas: PreviewGas;
  private readonly stepSeconds: number;
  public releasing = false;
  public ventOpen = false;

  /** `stepSeconds` is how much game time one `step` stands for (what the game's gas step is). */
  constructor(gas: PreviewGas, stepSeconds: number) {
    this.gas = gas;
    this.stepSeconds = stepSeconds;
    this.solid = LAYOUT.map((row) => row.split('').map((c) => c === '#'));
    this.grid = this.buildGrid();
  }

  private buildGrid(): GasGrid {
    const registry = new GasRegistry([{ typeKey: PREVIEW_KEY, ...this.gas }]);
    return new GasGrid(PREVIEW_WIDTH, PREVIEW_HEIGHT, registry, (x, y) => this.solid[y][x], { stepSeconds: this.stepSeconds });
  }

  public isSolid(x: number, y: number): boolean {
    return this.solid[y]?.[x] ?? true;
  }

  /** One simulation step (what the game does every few ticks). */
  public step(): void {
    if (this.releasing) this.grid.addGas(SPOUT.x, SPOUT.y, 1, RELEASE_RATE);
    this.grid.step();
  }

  public setReleasing(releasing: boolean): void {
    this.releasing = releasing;
  }

  /** Opens the gate in the roof, the way mining through to the surface would, so the column below it is open to the sky. */
  public openVent(): void {
    if (this.ventOpen) return;
    this.ventOpen = true;
    this.solid[VENT.y][VENT.x] = false;
    this.grid.onTileChanged(VENT.x, VENT.y);
  }

  /** Back to an empty box with the gate shut. */
  public reset(): void {
    this.releasing = false;
    this.ventOpen = false;
    this.solid[VENT.y][VENT.x] = true;
    this.grid = this.buildGrid();
  }

  public concentrationAt(x: number, y: number): number {
    return this.grid.getConcentration(x, y);
  }

  public isOpenToSky(x: number, y: number): boolean {
    return this.grid.isOpenToSky(x, y);
  }

  public stats(): { volume: number; vented: number; activeCells: number } {
    return { volume: this.grid.totalVolume(), vented: this.grid.ventedVolume, activeCells: this.grid.activeCount };
  }
}
