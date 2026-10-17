import {
  FluidGrid,
  FluidRegistry,
  MINING_CONFIG,
  applyFluidForces,
  crossFluidSurface,
  sampleFluidContact,
  isTileSolid,
  quantizeFluidLevel,
  toFluidWireCell,
  type FluidCellChange,
  type FluidClientDefinition,
  resolveFluidAppearance,
  type FluidEnvironment,
  type FluidWireCell,
  type MiningFluidSplashEvent,
  type ItemLightConfig,
  type ParticleEffectConfig,
  MiningTileType,
} from '@mine-me/shared';
import type { MiningWorld } from '../MiningWorld';

/**
 * Owns the room's fluid simulation: a shared `FluidGrid` laid over the tile grid. Solid tiles hold no
 * fluid; every other tile (empty, ladder, torch...) does. The simulation steps every
 * `FLUID_STEP_TICKS` ticks on the sim clock, and the whole map is simulated, but only cells that have
 * recently changed cost anything.
 */
export class MiningFluidSubsystem {
  public readonly registry: FluidRegistry;
  public readonly grid: FluidGrid;
  /** What bodies need to feel the fluid: the grid, and each fluid's viscosity and density. */
  public readonly environment: FluidEnvironment;

  constructor(private readonly world: MiningWorld) {
    this.registry = new FluidRegistry(world.data.getFluids());
    const tiles = world.grid;
    this.grid = new FluidGrid(
      tiles[0]?.length ?? 0,
      tiles.length,
      this.registry,
      (x, y) => isTileSolid(tiles[y][x].type as MiningTileType)
    );
    this.environment = {
      sampler: this.grid,
      propertiesOf: (id) => {
        const params = this.registry.paramsOf(id);
        return params ? { viscosity: params.viscosity ?? 0, density: params.density } : undefined;
      },
    };
  }

  /** Buoyancy and drag on loose bodies (dropped items, rocks, dynamite) in fluid. Runs just before the physics step. */
  public applyBodyForces(): void {
    applyFluidForces(this.world.rigidWorld.world, this.environment);
  }

  private readonly bodyFluid = new Map<string, number>();
  private readonly lastSplash = new Map<string, number>();
  private pendingSplashes: MiningFluidSplashEvent[] = [];

  /**
   * Notices players and mobs wading into or climbing out of a fluid and queues a splash event for each (with a short
   * cooldown per body, and some give at the surface, so a body bobbing there does not splash over and over). Runs
   * every tick; `takeSplashes` hands the events to the broadcast.
   */
  public trackSplashes(): void {
    const seen = new Set<string>();
    const consider = (key: string, body: { position: { x: number; y: number }; halfWidth: number; halfHeight: number }) => {
      seen.add(key);
      const contact = sampleFluidContact(this.grid, body.position.x, body.position.y, body.halfWidth, body.halfHeight);
      const before = this.bodyFluid.get(key) ?? 0;
      const { fluidId, crossings } = crossFluidSurface(before, contact, MINING_CONFIG.FLUID_SPLASH_ENTER_DEPTH, MINING_CONFIG.FLUID_SPLASH_EXIT_DEPTH);
      if (fluidId === 0) this.bodyFluid.delete(key);
      else this.bodyFluid.set(key, fluidId);
      if (crossings.length === 0) return;
      const last = this.lastSplash.get(key);
      if (last !== undefined && this.world.simTime - last < MINING_CONFIG.FLUID_SPLASH_COOLDOWN_SECONDS) return;
      this.lastSplash.set(key, this.world.simTime);
      for (const crossing of crossings) {
        this.pendingSplashes.push({ kind: crossing.kind, fluidId: crossing.fluidId, x: body.position.x, y: body.position.y });
      }
    };
    for (const session of this.world.players.values()) {
      if (!session.isDead) consider(`player:${session.characterId}`, session.playerBody);
    }
    for (const mob of this.world.mobs.activeMobs.values()) {
      if (mob.health > 0 && mob.animationState !== 'death') consider(`mob:${mob.id}`, mob.mobBody);
    }
    // Bodies that left the room are forgotten
    for (const key of [...this.bodyFluid.keys()]) if (!seen.has(key)) this.bodyFluid.delete(key);
    for (const key of [...this.lastSplash.keys()]) if (!seen.has(key)) this.lastSplash.delete(key);
  }

  /** The splashes since the last call, then forgets them. */
  public takeSplashes(): MiningFluidSplashEvent[] {
    const out = this.pendingSplashes;
    this.pendingSplashes = [];
    return out;
  }

  /** Runs once per tick; steps the simulation on every Nth tick. */
  public update(): void {
    if (this.world.tick % MINING_CONFIG.FLUID_STEP_TICKS !== 0) return;
    this.step();
  }

  /** One flow step, whatever the tick (the sandbox drives this itself to pause, step and change speed). */
  public step(): void {
    this.grid.step();
    this.applyReactions();
  }

  /** Cells the fluid reactions just used up become their block (water cools lava into lavarock). */
  private applyReactions(): void {
    for (const { x, y, becomes } of this.grid.takeReactions()) {
      this.world.blocks.placeBlockFromReaction(x, y, becomes);
    }
  }

  /** A tile changed (broken, placed, cracked...). Fluid inside a newly solid tile is pushed out; neighbours wake. */
  public onTileChanged(x: number, y: number): void {
    this.grid.onTileChanged(x, y);
  }

  /** Adds fluid by typeKey (used by map generation and tests). False if the fluid or cell is not valid. */
  public placeFluid(x: number, y: number, typeKey: string, amount = 1): boolean {
    const id = this.registry.idOf(typeKey);
    return id !== undefined && this.grid.addFluid(x, y, id, amount);
  }

  /** Cells that changed since the last call (everywhere, revealed or not). */
  public drainChanges(): FluidCellChange[] {
    return this.grid.drainChanges();
  }

  private isRevealed(x: number, y: number): boolean {
    return this.world.grid[y]?.[x]?.revealed === true;
  }

  /**
   * What to tell clients this tick: the changed cells the fog of war has revealed. Unrevealed cells are
   * never sent (that would show where oil is hiding); a cell's fluid goes out when the tile is revealed
   * (see `contentsAt`). Call once per tick.
   */
  public takeVisibleChanges(): FluidWireCell[] {
    const out: FluidWireCell[] = [];
    for (const change of this.grid.drainChanges()) {
      if (this.isRevealed(change.x, change.y)) out.push(toFluidWireCell(change.x, change.y, change.fluidId, change.level));
    }
    return out;
  }

  /** The fluid in one cell as [fluidId, quantised level], or undefined when it is empty. */
  public contentsAt(x: number, y: number): [number, number] | undefined {
    const id = this.grid.getFluidId(x, y);
    if (id === 0) return undefined;
    const q = quantizeFluidLevel(this.grid.getLevel(x, y));
    return q > 0 ? [id, q] : undefined;
  }

  /** All fluid in revealed cells, for a client joining the room. */
  public visibleSnapshot(): FluidWireCell[] {
    const out: FluidWireCell[] = [];
    for (let y = 0; y < this.grid.height; y++) {
      for (let x = 0; x < this.grid.width; x++) {
        if (!this.isRevealed(x, y)) continue;
        const contents = this.contentsAt(x, y);
        if (contents) out.push([x, y, contents[0], contents[1]]);
      }
    }
    return out;
  }

  /** How each burning block type looks (flames and light), for the block types that can burn. Sent once per client. */
  public blockFlameDefinitions(): Array<{ tileType: number; flame: { effect: ParticleEffectConfig | null; light: ItemLightConfig | null } }> {
    const out: Array<{ tileType: number; flame: { effect: ParticleEffectConfig | null; light: ItemLightConfig | null } }> = [];
    for (const tileType of Object.values(MiningTileType)) {
      const flammability = this.world.data.getBlockConfig(tileType)?.flammability;
      if (!flammability) continue;
      const effect = this.world.data.getParticleEffect(flammability.flameEffectId)?.config ?? null;
      const light = flammability.flameLight?.enabled === false ? null : (flammability.flameLight ?? null);
      if (effect || light) out.push({ tileType, flame: { effect, light } });
    }
    return out;
  }

  /** How each fluid in this room is drawn, with the cell ids the wire cells use. Sent once per client. */
  public clientDefinitions(): FluidClientDefinition[] {
    const out: FluidClientDefinition[] = [];
    for (const def of this.world.data.getFluids()) {
      const id = this.registry.idOf(def.typeKey);
      if (id === undefined) continue;
      const flammability = def.flammability;
      const effect = this.world.data.getParticleEffect(flammability?.flameEffectId)?.config ?? null;
      const light = flammability?.flameLight?.enabled === false ? null : (flammability?.flameLight ?? null);
      out.push({
        id,
        typeKey: def.typeKey,
        name: def.name,
        color: def.color,
        opacity: def.opacity,
        viscosity: def.viscosity,
        density: def.density,
        appearance: resolveFluidAppearance(def.appearance),
        ...(effect || light ? { flame: { effect, light } } : {}),
        ...(def.light && def.light.enabled !== false ? { light: def.light } : {}),
        ...(def.sounds && Object.keys(def.sounds).length > 0 ? { sounds: def.sounds } : {}),
      });
    }
    return out;
  }
}
