import { isTileSolid, type SandboxMobOption, type SandboxStatus } from '@mine-me/shared';
import type { MiningGameEngine } from '../MiningGameEngine';
import { WorldSimClock } from './WorldSimClock';

export type SandboxResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

/**
 * The sandbox's test tools: pour fluid, spawn a mob, light a fire, clear fluid and fire, god mode,
 * simulation speed, and reset. Each one checks its input (it comes from a client) and works through
 * the engine's own subsystems, so the sandbox exercises the real game code.
 */
export class SandboxTools {
  public readonly clock = new WorldSimClock();

  constructor(private readonly engine: MiningGameEngine) {}

  private inGrid(x: number, y: number): boolean {
    const grid = this.engine.grid;
    return Number.isInteger(x) && Number.isInteger(y) && y >= 0 && y < grid.length && x >= 0 && x < grid[0].length;
  }

  /** The mobs that can be spawned, for the tool panel. */
  public mobOptions(): SandboxMobOption[] {
    return this.engine.dataManager.getMobs().map((mob) => ({ id: mob.id, name: mob.name }));
  }

  public status(characterId: string): SandboxStatus {
    return {
      godMode: this.engine.getPlayer(characterId)?.godMode === true,
      paused: this.clock.paused,
      speed: this.clock.speed,
    };
  }

  /** Adds a full cell of a fluid to an open cell (or tops one up if it holds the same fluid). */
  public pourFluid(x: unknown, y: unknown, fluidKey: unknown): SandboxResult {
    if (typeof x !== 'number' || typeof y !== 'number' || !this.inGrid(x, y)) return fail('Pick a tile inside the map.');
    if (typeof fluidKey !== 'string' || !this.engine.dataManager.getFluid(fluidKey)) return fail('Unknown fluid.');
    if (!this.engine.fluidSubsystem.placeFluid(x, y, fluidKey, 1)) return fail('That tile cannot hold that fluid.');
    return { ok: true };
  }

  /** Spawns a mob at a point in open space. */
  public spawnMob(mobId: unknown, x: unknown, y: unknown): SandboxResult<{ instanceId: string }> {
    if (typeof mobId !== 'string') return fail('Pick a mob.');
    const mob = this.engine.dataManager.getMobData(mobId);
    if (!mob) return fail('Unknown mob.');
    if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) return fail('Pick a point inside the map.');
    const tx = Math.floor(x);
    const ty = Math.floor(y);
    if (!this.inGrid(tx, ty) && !(ty < 0 && this.inGrid(tx, 0))) return fail('Pick a point inside the map.');
    if (ty >= 0 && isTileSolid(this.engine.grid[ty][tx].type)) return fail('That spot is inside a block.');
    const spawned = this.engine.mobSubsystem.spawnMob(mob, { x, y });
    return { ok: true, instanceId: spawned.id };
  }

  /** Sets a cell alight if it can burn (uses the same flammability rules as everything else). */
  public ignite(x: unknown, y: unknown): SandboxResult {
    if (typeof x !== 'number' || typeof y !== 'number' || !this.inGrid(x, y)) return fail('Pick a tile inside the map.');
    if (!this.engine.fireSubsystem.grid.ignite(x, y)) return fail('Nothing there can burn.');
    return { ok: true };
  }

  /** Removes every fluid and fire in the room. */
  public clearHazards(): void {
    const fluids = this.engine.fluidSubsystem.grid;
    for (let y = 0; y < fluids.height; y++) {
      for (let x = 0; x < fluids.width; x++) {
        if (fluids.getLevel(x, y) > 0) fluids.drainFluid(x, y, Infinity);
      }
    }
    const fire = this.engine.fireSubsystem.grid;
    const burning: Array<[number, number]> = [];
    fire.forEachBurning((x, y) => burning.push([x, y]));
    for (const [x, y] of burning) fire.extinguish(x, y);
  }

  public setGodMode(characterId: string, enabled: unknown): SandboxResult {
    const session = this.engine.getPlayer(characterId);
    if (!session) return fail('You are not in this room.');
    if (typeof enabled !== 'boolean') return fail('Invalid setting.');
    session.godMode = enabled;
    return { ok: true };
  }

  /** Pauses or resumes the fluid and fire simulation, changes its speed, or runs one step. */
  public setSim(options: { paused?: unknown; speed?: unknown; step?: unknown }): SandboxResult {
    const { paused, speed, step } = options;
    if (paused !== undefined && typeof paused !== 'boolean') return fail('Invalid setting.');
    if (speed !== undefined && !WorldSimClock.isValidSpeed(speed)) return fail('Unsupported speed.');
    if (step !== undefined && typeof step !== 'boolean') return fail('Invalid setting.');
    if (paused !== undefined) this.clock.paused = paused;
    if (speed !== undefined) this.clock.speed = speed;
    if (step === true) this.clock.requestStep();
    return { ok: true };
  }

  /** Rebuilds the map and everything on it; everyone in the room goes back to the start. */
  public reset(): void {
    this.engine.resetWorld();
    this.clock.paused = false;
    this.clock.speed = 1;
  }
}

