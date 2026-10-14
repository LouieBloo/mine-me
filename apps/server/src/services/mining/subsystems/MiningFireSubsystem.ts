import { FireGrid, MINING_CONFIG, type FireWireCell, type FireWorld, type Flammability } from '@mine-me/shared';
import type { MiningWorld } from '../MiningWorld';

/** Seconds of fire simulated per step: fire steps on the same beat as fluids. */
export const FIRE_STEP_SECONDS = MINING_CONFIG.FLUID_STEP_TICKS / MINING_CONFIG.SERVER_TICK_RATE;

/**
 * Owns the room's fire: a shared `FireGrid` over the cells of the mine. Fire starts where the ignition
 * system says something caught, spreads and burns out by the rules in `FireGrid`, and burns the room's
 * fluid away as it goes. What burns is answered by the ignition system (`flammabilityAt`), so when blocks
 * become flammable (ticket 059) they burn here with no change.
 */
export class MiningFireSubsystem {
  public readonly grid: FireGrid;

  /** `random` gives a number in [0, 1); injected so tests (and a seeded room) control the dice. */
  constructor(
    private readonly world: MiningWorld,
    random: () => number = Math.random
  ) {
    const tiles = world.grid;
    this.grid = new FireGrid(tiles[0]?.length ?? 0, tiles.length, this.buildFireWorld(), random);
  }

  private buildFireWorld(): FireWorld {
    return {
      flammabilityAt: (x, y): Flammability | null => this.world.ignition.flammabilityAt(x, y),
      // A cell with fluid burns the fluid (its level is the fuel); a cell with a flammable block burns the block
      fuelAt: (x, y) => {
        const level = this.world.fluids.grid.getLevel(x, y);
        return level > 0 ? level : this.world.ignition.flammabilityAt(x, y) ? 1 : 0;
      },
      consumeFuel: (x, y, amount) => {
        this.world.fluids.grid.drainFluid(x, y, amount);
      },
      // A fluid that burns out leaves nothing; a block becomes what it burns into (or nothing)
      spend: (x, y) => {
        if (this.world.fluids.grid.getLevel(x, y) > 0) return;
        const burnsInto = this.world.ignition.flammabilityAt(x, y)?.burnsInto;
        this.world.blocks.burnBlock(x, y, burnsInto);
      },
    };
  }

  /** Runs once per tick; on every Nth tick it collects sparks from torches and carried items, takes new sparks and steps the fire on every Nth tick. */
  public update(): void {
    if (this.world.tick % MINING_CONFIG.FLUID_STEP_TICKS !== 0) return;
    this.step();
  }

  /** One fire step, whatever the tick (the sandbox drives this itself to pause, step and change speed). */
  public step(): void {
    this.world.ignition.emitFromSources();
    for (const cell of this.world.ignition.takeIgnited()) this.grid.ignite(cell.x, cell.y);
    this.grid.step(FIRE_STEP_SECONDS);
  }

  private isRevealed(x: number, y: number): boolean {
    return this.world.grid[y]?.[x]?.revealed === true;
  }

  /** What to tell clients this tick: fires that started or stopped in cells the fog of war has revealed. */
  public takeVisibleChanges(): FireWireCell[] {
    const out: FireWireCell[] = [];
    for (const change of this.grid.drainChanges()) {
      if (this.isRevealed(change.x, change.y)) out.push([change.x, change.y, change.burning ? 1 : 0]);
    }
    return out;
  }

  /** Whether a cell is burning (used to describe a tile as it is revealed). */
  public isBurning(x: number, y: number): boolean {
    return this.grid.isBurning(x, y);
  }

  /** All fire in revealed cells, for a client joining the room. */
  public visibleSnapshot(): FireWireCell[] {
    const out: FireWireCell[] = [];
    this.grid.forEachBurning((x, y) => {
      if (this.isRevealed(x, y)) out.push([x, y, 1]);
    });
    return out;
  }
}
