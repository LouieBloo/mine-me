import {
  GasGrid,
  GasRegistry,
  MINING_CONFIG,
  isTileSolid,
  sampleGasContact,
  quantizeGasConcentration,
  resolveGasAppearance,
  toGasWireCell,
  type GasCellChange,
  type GasClientDefinition,
  type GasEnvironment,
  type GasEvent,
  type GasWireCell,
  type MiningTileType,
} from '@mine-me/shared';
import type { MiningWorld } from '../MiningWorld';

/** Seconds of game time one gas step stands for. */
export const GAS_STEP_SECONDS = MINING_CONFIG.GAS_STEP_TICKS / MINING_CONFIG.SERVER_TICK_RATE;

/**
 * Owns the room's gas simulation: a shared `GasGrid` laid over the tile grid. Solid tiles hold no gas;
 * every other tile (empty, ladder, torch...) does, unless fluid is in it (fluid wins a cell). The
 * simulation steps every `GAS_STEP_TICKS` ticks on the sim clock, and the whole map is simulated, but
 * only cells that have recently changed cost anything.
 */
export class MiningGasSubsystem {
  public readonly registry: GasRegistry;
  public readonly grid: GasGrid;
  /** What bodies need to sense the gas: the grid, and each gas's density. */
  public readonly environment: GasEnvironment;

  constructor(private readonly world: MiningWorld) {
    this.registry = new GasRegistry(world.data.getGases());
    const tiles = world.grid;
    this.grid = new GasGrid(
      tiles[0]?.length ?? 0,
      tiles.length,
      this.registry,
      (x, y) => isTileSolid(tiles[y][x].type as MiningTileType),
      {
        stepSeconds: GAS_STEP_SECONDS,
        // Looked up when asked, so it follows the room's fluid subsystem even though that is built first
        hasFluid: (x, y) => this.world.fluids.grid.getFluidId(x, y) !== 0,
      }
    );
    this.environment = {
      sampler: this.grid,
      propertiesOf: (id) => {
        const params = this.registry.paramsOf(id);
        return params ? { density: params.density } : undefined;
      },
    };
  }

  private events: GasEvent[] = [];
  private readonly bodyGas = new Map<string, number>();
  private readonly lastBodyEvent = new Map<string, number>();

  /**
   * Notices players and mobs walking into or out of a gas cloud and queues an event for each (with a short cooldown per
   * body, and some give at the edge, so a body standing at the rim of a cloud does not set off sound after sound). A body
   * counts as in a cloud once the gas around it reaches `GAS_ENTER_CONCENTRATION` and as out once it is under
   * `GAS_EXIT_CONCENTRATION`. Runs every tick; `takeEvents` hands the events to the broadcast.
   */
  public trackBodies(): void {
    const seen = new Set<string>();
    const consider = (key: string, body: { position: { x: number; y: number }; halfWidth: number; halfHeight: number }) => {
      seen.add(key);
      const contact = sampleGasContact(this.grid, body.position.x, body.position.y, body.halfWidth, body.halfHeight);
      const current = this.bodyGas.get(key) ?? 0;
      const thick = contact && contact.concentration >= MINING_CONFIG.GAS_ENTER_CONCENTRATION ? contact.gasId : 0;
      const thin = !contact || contact.concentration < MINING_CONFIG.GAS_EXIT_CONCENTRATION || contact.gasId !== current;
      const crossings: GasEvent[] = [];
      let now = current;
      if (current !== 0 && thin) {
        crossings.push({ kind: 'exit', gasId: current, x: body.position.x, y: body.position.y });
        now = 0;
      }
      if (now === 0 && thick !== 0) {
        crossings.push({ kind: 'enter', gasId: thick, x: body.position.x, y: body.position.y });
        now = thick;
      }
      if (now === 0) this.bodyGas.delete(key);
      else this.bodyGas.set(key, now);
      if (crossings.length === 0) return;
      const last = this.lastBodyEvent.get(key);
      if (last !== undefined && this.world.simTime - last < MINING_CONFIG.GAS_EVENT_COOLDOWN_SECONDS) return;
      this.lastBodyEvent.set(key, this.world.simTime);
      this.events.push(...crossings);
    };
    for (const session of this.world.players.values()) {
      if (!session.isDead) consider(`player:${session.characterId}`, session.playerBody);
    }
    for (const mob of this.world.mobs.activeMobs.values()) {
      if (mob.health > 0 && mob.animationState !== 'death') consider(`mob:${mob.id}`, mob.mobBody);
    }
    // Bodies that left the room are forgotten
    for (const key of [...this.bodyGas.keys()]) if (!seen.has(key)) this.bodyGas.delete(key);
    for (const key of [...this.lastBodyEvent.keys()]) if (!seen.has(key)) this.lastBodyEvent.delete(key);
  }

  /** Queues a gas event from outside this subsystem (a gas set alight). */
  public pushEvent(event: GasEvent): void {
    this.events.push(event);
  }

  /** The events since the last call, then forgets them. Cell events (`ignite`, `vent`) only in revealed tiles. */
  public takeEvents(): GasEvent[] {
    const out = this.events.filter((e) => (e.kind === 'enter' || e.kind === 'exit') || this.isRevealed(Math.floor(e.x), Math.floor(e.y)));
    this.events = [];
    return out;
  }

  /** Runs once per tick; steps the simulation on every Nth tick. */
  public update(): void {
    if (this.world.tick % MINING_CONFIG.GAS_STEP_TICKS !== 0) return;
    this.step();
  }

  /** One gas step, whatever the tick (the sandbox drives this itself to pause, step and change speed). */
  public step(): void {
    // Fluid that has just flowed into a gas cell pushes the gas out. Only needed while some fluid is moving.
    if (this.world.fluids.grid.activeCount > 0) this.grid.evictFromFluid();
    this.grid.step();
  }

  /**
   * A tile changed (broken, placed, cracked...). Gas inside a newly solid tile is pushed out; open sky is worked out
   * again; neighbours wake. When breaking a roof opens gas to the sky, one `vent` event is queued for the column (at the
   * highest cell that was newly opened, so the sound comes from where the gas starts to escape).
   */
  public onTileChanged(x: number, y: number): void {
    const wasOpen = new Set<number>();
    for (let cy = 0; cy < this.grid.height; cy++) if (this.grid.isOpenToSky(x, cy)) wasOpen.add(cy);
    this.grid.onTileChanged(x, y);
    for (let cy = 0; cy < this.grid.height; cy++) {
      if (wasOpen.has(cy) || !this.grid.isOpenToSky(x, cy)) continue;
      const gasId = this.grid.getGasId(x, cy);
      if (gasId !== 0 && this.grid.getConcentration(x, cy) >= MINING_CONFIG.GAS_VENT_EVENT_MIN_CONCENTRATION) {
        this.events.push({ kind: 'vent', gasId, x: x + 0.5, y: cy + 0.5 });
        break;
      }
    }
  }

  /** Adds gas by typeKey (used by map generation, emitters and tests). False if the gas is unknown or the cell cannot take any. */
  public placeGas(x: number, y: number, typeKey: string, amount = 1): boolean {
    const id = this.registry.idOf(typeKey);
    return id !== undefined && this.grid.addGas(x, y, id, amount) > 0;
  }

  /** Cells that changed since the last call (everywhere, revealed or not). */
  public drainChanges(): GasCellChange[] {
    return this.grid.drainChanges();
  }

  /** The gas in one cell as [gasId, concentration], or undefined when it is empty. */
  public contentsAt(x: number, y: number): [number, number] | undefined {
    const id = this.grid.getGasId(x, y);
    return id === 0 ? undefined : [id, this.grid.getConcentration(x, y)];
  }

  private isRevealed(x: number, y: number): boolean {
    return this.world.grid[y]?.[x]?.revealed === true;
  }

  /**
   * What to tell clients this tick: the changed cells the fog of war has revealed. Unrevealed cells are
   * never sent (that would show where gas is hiding); a cell's gas goes out when the tile is revealed
   * (see `wireContentsAt`). Call once per tick.
   */
  public takeVisibleChanges(): GasWireCell[] {
    const out: GasWireCell[] = [];
    for (const change of this.grid.drainChanges()) {
      if (this.isRevealed(change.x, change.y)) out.push(toGasWireCell(change.x, change.y, change.gasId, change.concentration));
    }
    return out;
  }

  /** The gas in one cell as [gasId, quantised concentration], or undefined when it is empty. */
  public wireContentsAt(x: number, y: number): [number, number] | undefined {
    const id = this.grid.getGasId(x, y);
    if (id === 0) return undefined;
    const q = quantizeGasConcentration(this.grid.getConcentration(x, y));
    return q > 0 ? [id, q] : undefined;
  }

  /** All gas in revealed cells, for a client joining the room. */
  public visibleSnapshot(): GasWireCell[] {
    const out: GasWireCell[] = [];
    for (let y = 0; y < this.grid.height; y++) {
      for (let x = 0; x < this.grid.width; x++) {
        if (!this.isRevealed(x, y)) continue;
        const contents = this.wireContentsAt(x, y);
        if (contents) out.push([x, y, contents[0], contents[1]]);
      }
    }
    return out;
  }

  /** How each gas in this room is drawn, with the cell ids the wire cells use. Sent once per client. */
  public clientDefinitions(): GasClientDefinition[] {
    const out: GasClientDefinition[] = [];
    for (const def of this.world.data.getGases()) {
      const id = this.registry.idOf(def.typeKey);
      if (id === undefined) continue;
      const flammability = def.flammability;
      const effect = flammability?.explosion ? (this.world.data.getParticleEffect(flammability.flameEffectId)?.config ?? null) : null;
      const light = flammability?.explosion && flammability.flameLight?.enabled !== false ? (flammability.flameLight ?? null) : null;
      out.push({
        id,
        typeKey: def.typeKey,
        name: def.name,
        color: def.color,
        opacity: def.opacity,
        density: def.density,
        appearance: resolveGasAppearance(def.appearance),
        ...(def.sounds && Object.keys(def.sounds).length > 0 ? { sounds: def.sounds } : {}),
        ...(effect || light ? { explosion: { effect, light } } : {}),
      });
    }
    return out;
  }
}
