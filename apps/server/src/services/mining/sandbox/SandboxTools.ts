import { isTileSolid, type SandboxMobOption, type SandboxStatus } from '@mine-me/shared';
import type { MiningGameEngine } from '../MiningGameEngine';
import { WorldSimClock } from './WorldSimClock';
import { findExtractorScene, heaviestItemId } from './extractorScenes';

export type SandboxResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

/**
 * The sandbox's test tools: pour fluid, release gas, spawn a mob, light a fire, clear fluid, fire and gas, god mode,
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
  /** Fills an open tile with the fluid, up to a full cell (holding the tool keeps it topped up). */
  public pourFluid(x: unknown, y: unknown, fluidKey: unknown): SandboxResult {
    if (typeof x !== 'number' || typeof y !== 'number' || !this.inGrid(x, y)) return fail('Pick a tile inside the map.');
    if (typeof fluidKey !== 'string' || !this.engine.dataManager.getFluid(fluidKey)) return fail('Unknown fluid.');
    // Tops the tile up to full and no further. Adding a whole cell every time (the tool repeats while held) left the
    // tile holding more than a cell, which the simulation pushed out sideways in mid-air.
    const fluids = this.engine.fluidSubsystem;
    const id = fluids.registry.idOf(fluidKey);
    const here = fluids.grid.getFluidId(x, y);
    const room = here === 0 || here === id ? 1 - fluids.grid.getLevel(x, y) : 1;
    if (room <= 0.001 && here === id) return { ok: true };
    if (!fluids.placeFluid(x, y, fluidKey, room)) return fail('That tile cannot hold that fluid.');
    return { ok: true };
  }

  /** Adds gas to an open cell (up to a full cell, or tops one up if it holds the same gas). */
  public releaseGas(x: unknown, y: unknown, gasKey: unknown): SandboxResult {
    if (typeof x !== 'number' || typeof y !== 'number' || !this.inGrid(x, y)) return fail('Pick a tile inside the map.');
    if (typeof gasKey !== 'string' || !this.engine.dataManager.getGas(gasKey)) return fail('Unknown gas.');
    if (!this.engine.gasSubsystem.placeGas(x, y, gasKey, 1)) return fail('That tile cannot hold that gas.');
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

  /**
   * Sets a cell alight if it can burn (uses the same flammability rules as everything else). Explosive gas does not
   * burn like a fluid: it is set off as an explosion instead, whatever its ignition chance.
   */
  public ignite(x: unknown, y: unknown): SandboxResult {
    if (typeof x !== 'number' || typeof y !== 'number' || !this.inGrid(x, y)) return fail('Pick a tile inside the map.');
    if (this.engine.gasExplosionSubsystem.ignite(x, y)) return { ok: true };
    if (!this.engine.fireSubsystem.grid.ignite(x, y)) return fail('Nothing there can burn.');
    return { ok: true };
  }

  /** Removes every fluid, fire and gas in the room. */
  public clearHazards(): void {
    const fluids = this.engine.fluidSubsystem.grid;
    for (let y = 0; y < fluids.height; y++) {
      for (let x = 0; x < fluids.width; x++) {
        if (fluids.getLevel(x, y) > 0) fluids.drainFluid(x, y, Infinity);
      }
    }
    const gases = this.engine.gasSubsystem.grid;
    for (let y = 0; y < gases.height; y++) {
      for (let x = 0; x < gases.width; x++) {
        if (gases.getConcentration(x, y) > 0) gases.drainGas(x, y, Infinity);
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

  /** Pauses or resumes the fluid, gas and fire simulation, changes its speed, or runs one step. */
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

  /** Puts the extractor and its belt in the room, landing now. False (with a reason) if it is already there. */
  public spawnExtractor(): SandboxResult {
    if (!this.engine.spawnExtractorNow()) return fail('The extractor is already here.');
    return { ok: true };
  }

  /** Digs `rows` belt segments at once (stops where the belt would wait). */
  public digBelt(rows: unknown): SandboxResult<{ laid: number }> {
    if (typeof rows !== 'number' || !Number.isInteger(rows) || rows < 1 || rows > 200) return fail('Choose between 1 and 200 segments.');
    const belt = this.engine.beltSubsystem;
    if (!belt) return fail('Spawn the extractor first.');
    this.engine.extractorSubsystem!.skipLanding();
    return { ok: true, laid: belt.buildInstantly(rows) };
  }

  /** Sets how much a player can carry (the backpack weight limit). */
  public setCapacity(characterId: string, capacity: unknown): SandboxResult {
    const session = this.engine.getPlayer(characterId);
    if (!session) return fail('You are not in the room.');
    if (typeof capacity !== 'number' || !Number.isFinite(capacity) || capacity < 0 || capacity > 100000) return fail('Choose a capacity from 0 to 100000.');
    session.carryCapacity = capacity;
    session.backpackDirty = true;
    return { ok: true };
  }

  /** Adds items to a player's backpack, whatever the weight (so the full-pack rules can be tried). */
  public fillBackpack(characterId: string, itemId: unknown, quantity: unknown): SandboxResult {
    const session = this.engine.getPlayer(characterId);
    if (!session) return fail('You are not in the room.');
    const chosen = itemId === undefined ? heaviestItemId(this.engine) : itemId;
    if (typeof chosen !== 'string') return fail('Pick an item.');
    const def = this.engine.dataManager.getItemData(chosen);
    if (!def) return fail('Unknown item.');
    if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1 || quantity > 10000) return fail('Choose between 1 and 10000.');
    const held = session.temporaryBackpack.find((s) => s.itemId === def.id);
    if (held) held.quantity += quantity;
    else session.temporaryBackpack.push({ itemId: def.id, itemName: def.name, iconUrl: def.iconUrl ?? null, quantity });
    session.backpackDirty = true;
    return { ok: true };
  }

  /** Puts the room into one of the named extractor test scenes. */
  public loadExtractorScene(characterId: string, sceneId: unknown): SandboxResult {
    const scene = findExtractorScene(sceneId);
    if (!scene) return fail('Unknown scene.');
    if (!this.engine.getPlayer(characterId)) return fail('You are not in the room.');
    return scene.apply(this.engine, characterId);
  }

  /** Rebuilds the map and everything on it; everyone in the room goes back to the start. */
  public reset(): void {
    this.engine.extractorRequested = false;
    this.engine.resetWorld();
    this.clock.paused = false;
    this.clock.speed = 1;
  }
}

