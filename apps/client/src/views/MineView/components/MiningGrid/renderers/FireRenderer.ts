import { layoutFluidCell, type FireField, type ItemLightConfig } from '@mine-me/shared';
import type { ParticleEngine, EmitterHandle } from '../../../../../components/game/particles/ParticleEngine';
import type { LightingEngine } from '../../../../../components/game/lighting/LightingEngine';
import type { LightSource } from '../../../../../components/game/lighting/LightSource';
import { createItemLight } from '../../../../../components/game/lighting/itemLight';
import type { FlameLook, FluidRenderer } from './FluidRenderer';
import { TILE_SIZE } from './MiningTileRenderer';

/** Most flame emitters alive at once; the burning cells nearest the player get them first. */
export const MAX_FLAME_EMITTERS = 120;
/** Most fire lights alive at once (lights are the costly part). */
export const MAX_FIRE_LIGHTS = 20;
/** How often the set of flames and lights is brought up to date. */
export const FIRE_SYNC_INTERVAL_MS = 100;

interface BurningCell {
  key: number;
  x: number;
  y: number;
  distance: number;
  flame: FlameLook;
}

/**
 * Draws fire: flames rising from every burning cell and a light on the ones nearest the player. What a
 * burning cell looks like is data (its fluid's flame effect and light), so a new fuel needs no code here.
 * `sync` is called every frame and does its work a few times a second; it follows the fire as cells start
 * and stop burning and as the burning oil's surface sinks.
 */
export class FireRenderer {
  private readonly fire: FireField;
  private readonly fluids: FluidRenderer;
  private readonly tileSize: number;
  private particles: ParticleEngine | null = null;
  private lighting: LightingEngine | null = null;
  private readonly emitters = new Map<number, { handle: EmitterHandle; effect: object }>();
  private readonly lights = new Map<number, { light: LightSource; configKey: string }>();
  private lastSync = -Infinity;
  private readonly blockFlames = new Map<number, FlameLook>();
  private tileTypeAt: ((x: number, y: number) => number | undefined) | null = null;

  constructor(fire: FireField, fluids: FluidRenderer, tileSize: number = TILE_SIZE) {
    this.fire = fire;
    this.fluids = fluids;
    this.tileSize = tileSize;
  }

  public setEngines(particles: ParticleEngine | null, lighting: LightingEngine | null): void {
    if (this.particles !== particles || this.lighting !== lighting) this.clear();
    this.particles = particles;
    this.lighting = lighting;
  }

  /** How each block type that can burn looks while it burns (by tile type). Replaces what was set. */
  public setBlockFlames(flames: ReadonlyArray<{ tileType: number; flame: FlameLook }>): void {
    this.blockFlames.clear();
    for (const entry of flames) this.blockFlames.set(entry.tileType, entry.flame);
    this.lastSync = -Infinity;
  }

  /** Where to read the type of the tile in a cell from (the client's grid), so burning blocks can be drawn. */
  public setTileTypeSource(source: ((x: number, y: number) => number | undefined) | null): void {
    this.tileTypeAt = source;
  }

  /** The look of the fire in a cell: its fluid's if it holds fluid, otherwise its block's. */
  private flameAt(x: number, y: number): FlameLook | undefined {
    const fluidId = this.fluids.field.getFluidId(x, y);
    if (fluidId !== 0) return this.fluids.flameOf(fluidId);
    const tileType = this.tileTypeAt?.(x, y);
    return tileType === undefined ? undefined : this.blockFlames.get(tileType);
  }

  public get emitterCount(): number {
    return this.emitters.size;
  }

  public get lightCount(): number {
    return this.lights.size;
  }

  /** Brings flames and lights up to date with the fire, at most once per `FIRE_SYNC_INTERVAL_MS`. `focus` is a tile position (the player). */
  public sync(nowMs: number, focus: { x: number; y: number }): void {
    if (nowMs - this.lastSync < FIRE_SYNC_INTERVAL_MS) return;
    this.lastSync = nowMs;

    const cells: BurningCell[] = [];
    this.fire.forEachBurning((x, y) => {
      const flame = this.flameAt(x, y);
      if (!flame) return;
      cells.push({ key: y * this.fire.width + x, x, y, distance: Math.hypot(x + 0.5 - focus.x, y + 0.5 - focus.y), flame });
    });
    cells.sort((a, b) => a.distance - b.distance || a.key - b.key);

    this.syncEmitters(cells);
    this.syncLights(cells);
  }

  /** Where flames rise from in a cell: the middle of the burning surface (the top of a burning block). */
  private surfacePixel(x: number, y: number): { x: number; y: number } {
    const rect = layoutFluidCell(this.fluids.field, x, y, this.tileSize);
    return { x: (x + 0.5) * this.tileSize, y: rect ? rect.y : (y + 0.5) * this.tileSize };
  }

  private syncEmitters(cells: BurningCell[]): void {
    const wanted = new Map<number, BurningCell>();
    if (this.particles) {
      for (const cell of cells) {
        if (!cell.flame.effect) continue;
        if (wanted.size >= MAX_FLAME_EMITTERS) break;
        wanted.set(cell.key, cell);
      }
    }

    for (const [key, entry] of this.emitters) {
      const cell = wanted.get(key);
      if (!cell || cell.flame.effect !== entry.effect) {
        entry.handle.destroy();
        this.emitters.delete(key);
      }
    }
    for (const [key, cell] of wanted) {
      const position = this.surfacePixel(cell.x, cell.y);
      const existing = this.emitters.get(key);
      if (existing) {
        existing.handle.setPosition(position);
      } else if (this.particles && cell.flame.effect) {
        this.emitters.set(key, { handle: this.particles.addEmitter(cell.flame.effect, position), effect: cell.flame.effect });
      }
    }
  }

  private syncLights(cells: BurningCell[]): void {
    const wanted = new Map<number, { cell: BurningCell; config: ItemLightConfig }>();
    if (this.lighting) {
      for (const cell of cells) {
        const config = cell.flame.light;
        if (!config || config.enabled === false) continue;
        if (wanted.size >= MAX_FIRE_LIGHTS) break;
        wanted.set(cell.key, { cell, config });
      }
    }

    for (const [key, entry] of this.lights) {
      const target = wanted.get(key);
      if (!target || JSON.stringify(target.config) !== entry.configKey) {
        this.lighting?.removeLight(entry.light.id);
        this.lights.delete(key);
      }
    }
    for (const [key, { cell, config }] of wanted) {
      const position = this.surfacePixel(cell.x, cell.y);
      const x = position.x / this.tileSize;
      const y = position.y / this.tileSize - 0.3; // a little above the surface
      const existing = this.lights.get(key);
      if (existing) {
        existing.light.setPosition(x, y);
      } else if (this.lighting) {
        const light = createItemLight(`fire_light_${key}`, config, x, y);
        this.lighting.addLight(light);
        this.lights.set(key, { light, configKey: JSON.stringify(config) });
      }
    }
  }

  /** Removes every flame and light (the engines stay). */
  public clear(): void {
    for (const entry of this.emitters.values()) entry.handle.destroy();
    this.emitters.clear();
    for (const entry of this.lights.values()) this.lighting?.removeLight(entry.light.id);
    this.lights.clear();
    this.lastSync = -Infinity;
  }

  public destroy(): void {
    this.clear();
    this.particles = null;
    this.lighting = null;
  }
}
