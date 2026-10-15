import { Container, Graphics } from 'pixi.js';
import {
  DEFAULT_GAS_APPEARANCE, GAS_BLOB_LAYERS, GAS_VISIBLE_MIN, GasField, gasBlobCentre, gasBlobRadius, gasCellAlpha, gasDriftPhase, parseHexColor,
  type GasAppearance, type GasClientDefinition, type GasEnvironment, type GasSoundEffectsConfig, type GasWireCell,
} from '@mine-me/shared';
import type { ParticleEngine } from '../../../../../components/game/particles/ParticleEngine';
import type { LightingEngine } from '../../../../../components/game/lighting/LightingEngine';
import { createItemLight } from '../../../../../components/game/lighting/itemLight';
import { TILE_SIZE } from './MiningTileRenderer';

/** What a cell of an exploding gas looks like as it detonates: a burst of particles and a flash of light (either may be missing). */
export type ExplosionLook = NonNullable<GasClientDefinition['explosion']>;

/** Most particle bursts started by one batch of detonations (a long front is thinned to this many, spread along it). */
export const MAX_EXPLOSION_BURSTS = 40;
/** Most flash lights started by one batch of detonations (lights are the costly part). */
export const MAX_EXPLOSION_LIGHTS = 8;
/** How long a detonation's flash of light stays, in ms. */
export const EXPLOSION_LIGHT_MS = 350;

/** Cells per chunk side. Only chunks whose cells changed (or that are drifting) are redrawn. */
export const GAS_CHUNK_SIZE = 8;
export { GAS_VISIBLE_MIN, gasBlobRadius, gasCellAlpha, gasDriftPhase };

/** How quickly the drawn concentration catches up with the server's, per second (higher is snappier). */
const EASE_RATE = 8;
/** The longest time step the easing takes in one go (a frame after a stall should not jump everything). */
const MAX_EASE_STEP_SECONDS = 0.1;
/** Drifting chunks are redrawn at most this often, in seconds. */
const DRIFT_REDRAW_SECONDS = 1 / 15;
/** A drawn concentration this close to its target snaps to it. */
const SNAP = 0.004;

interface GasLook {
  color: number;
  opacity: number;
  appearance: GasAppearance;
}

interface ChunkView {
  root: Container;
  graphics: Graphics;
  /** True when something in the chunk is drawn, so it drifts and must be redrawn as time passes. */
  drifting: boolean;
  lastDrawn: number;
}

/**
 * Draws the gas the server has revealed. Holds the client's copy of the gas grid (`field`, exact: the
 * player's predicted body reads it), applies the server's changed cells to it, and draws an eased copy so a
 * cloud thickens and thins smoothly between the server's steps. Each cell is a soft round blob whose opacity
 * follows its concentration, with a slow drift; only the chunks that changed or are drifting are redrawn.
 */
export class GasRenderer {
  public readonly field: GasField;
  /** The gas as bodies sense it (density by cell id), for the player's predicted body. */
  public readonly environment: GasEnvironment;
  /** The concentrations as drawn: eased towards `field`. */
  private readonly display: Float32Array;
  private readonly displayIds: Uint8Array;
  private readonly definitions = new Map<number, GasLook>();
  private readonly properties = new Map<number, { density: number }>();
  private readonly sounds = new Map<number, GasSoundEffectsConfig>();
  private readonly explosions = new Map<number, ExplosionLook>();
  private particles: ParticleEngine | null = null;
  private lighting: LightingEngine | null = null;
  private readonly flashTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private flashCounter = 0;
  private readonly chunks = new Map<number, ChunkView>();
  private readonly dirty = new Set<number>();
  /** Cells whose drawn concentration is still moving towards the server's. */
  private readonly easing = new Set<number>();
  private readonly chunksAcross: number;
  private readonly container: Container;
  private readonly tileSize: number;
  private time = 0;
  private lastUpdate: number | null = null;

  constructor(container: Container, width: number, height: number, definitions: readonly GasClientDefinition[] = [], tileSize: number = TILE_SIZE) {
    this.container = container;
    this.tileSize = tileSize;
    this.field = new GasField(width, height);
    this.display = new Float32Array(width * height);
    this.displayIds = new Uint8Array(width * height);
    this.environment = { sampler: this.field, propertiesOf: (id) => this.properties.get(id) };
    this.chunksAcross = Math.ceil(width / GAS_CHUNK_SIZE);
    this.setDefinitions(definitions);
  }

  /** Replaces how each gas looks and redraws everything that is showing. */
  public setDefinitions(definitions: readonly GasClientDefinition[]): void {
    this.definitions.clear();
    this.properties.clear();
    this.sounds.clear();
    this.explosions.clear();
    for (const def of definitions) {
      this.properties.set(def.id, { density: def.density });
      if (def.sounds) this.sounds.set(def.id, def.sounds);
      if (def.explosion) this.explosions.set(def.id, def.explosion);
      this.definitions.set(def.id, {
        color: parseHexColor(def.color),
        opacity: Math.min(1, Math.max(0, def.opacity)),
        appearance: def.appearance ?? DEFAULT_GAS_APPEARANCE,
      });
    }
    for (const key of this.chunks.keys()) this.dirty.add(key);
  }

  /** The particle and lighting engines detonations are drawn with (leave null to draw none). */
  public setEngines(particles: ParticleEngine | null, lighting: LightingEngine | null): void {
    if (this.lighting !== lighting) this.clearFlashes();
    this.particles = particles;
    this.lighting = lighting;
  }

  /** How a cell of this gas looks as it detonates, or undefined if it draws nothing. */
  public explosionOf(gasId: number): ExplosionLook | undefined {
    return this.explosions.get(gasId);
  }

  /**
   * Plays the cells of explosive gas the server says detonated: a burst of the gas's particle effect in each, and
   * a brief light on some of them (the look is the gas's own data). A long front is thinned so a big pocket does
   * not start thousands of effects. Returns how many bursts were started.
   */
  public playExplosions(cells: ReadonlyArray<readonly [x: number, y: number, gasId: number]>): number {
    if (cells.length === 0) return 0;
    let bursts = 0;
    const burstEvery = Math.max(1, Math.ceil(cells.length / MAX_EXPLOSION_BURSTS));
    const lightEvery = Math.max(1, Math.ceil(cells.length / MAX_EXPLOSION_LIGHTS));
    cells.forEach(([x, y, gasId], index) => {
      const look = this.explosions.get(gasId);
      if (!look) return;
      if (look.effect && this.particles && index % burstEvery === 0) {
        this.particles.spawnBurst(look.effect, { x: (x + 0.5) * this.tileSize, y: (y + 0.5) * this.tileSize });
        bursts++;
      }
      if (look.light && this.lighting && index % lightEvery === 0) this.flash(look.light, x, y);
    });
    return bursts;
  }

  private flash(light: NonNullable<ExplosionLook['light']>, x: number, y: number): void {
    const lighting = this.lighting;
    if (!lighting) return;
    const id = `gas_flash_${this.flashCounter++}`;
    lighting.addLight(createItemLight(id, light, x + 0.5, y + 0.5));
    this.flashTimers.set(
      id,
      setTimeout(() => {
        this.flashTimers.delete(id);
        lighting.removeLight(id);
      }, EXPLOSION_LIGHT_MS)
    );
  }

  private clearFlashes(): void {
    for (const [id, timer] of this.flashTimers) {
      clearTimeout(timer);
      this.lighting?.removeLight(id);
    }
    this.flashTimers.clear();
  }

  /** The gas's playable sounds, or undefined if it is silent. */
  public soundsOf(gasId: number): GasSoundEffectsConfig | undefined {
    return this.sounds.get(gasId);
  }

  private chunkKey(x: number, y: number): number {
    return Math.floor(y / GAS_CHUNK_SIZE) * this.chunksAcross + Math.floor(x / GAS_CHUNK_SIZE);
  }

  /** The concentration drawn in a cell right now (eased, so it trails `field.getConcentration`). */
  public displayedConcentration(x: number, y: number): number {
    return x >= 0 && y >= 0 && x < this.field.width && y < this.field.height ? this.display[y * this.field.width + x] : 0;
  }

  /**
   * Applies changed cells to the exact copy. With `smooth` the drawing eases to them over the next frames (the
   * cloud thickening and thinning); without, it shows them at once (the first snapshot, or gas that just came into view).
   */
  public apply(cells: readonly GasWireCell[], smooth = false): void {
    for (const [x, y] of this.field.apply(cells)) {
      const i = y * this.field.width + x;
      const id = this.field.getGasId(x, y);
      const target = this.field.getConcentration(x, y);
      // A different gas arriving in a cell is not a thickening: show it from where it stands
      if (!smooth || id !== this.displayIds[i] || id === 0) {
        this.display[i] = target;
        this.displayIds[i] = id;
        this.easing.delete(i);
        this.dirty.add(this.chunkKey(x, y));
      } else {
        this.easing.add(i);
      }
    }
  }

  /** Redraws the chunks that changed. Cheap when nothing did. Returns how many were redrawn. */
  public render(): number {
    if (this.dirty.size === 0) return 0;
    let redrawn = 0;
    for (const key of this.dirty) {
      this.drawChunk(key);
      redrawn++;
    }
    this.dirty.clear();
    return redrawn;
  }

  /**
   * Once per frame: eases the drawn gas towards the server's (redrawing what moved), and moves the drift on to
   * `timeSec` (redrawing drifting chunks a few times a second).
   */
  public update(timeSec: number): void {
    const dt = this.lastUpdate === null ? 0 : Math.min(MAX_EASE_STEP_SECONDS, Math.max(0, timeSec - this.lastUpdate));
    this.lastUpdate = timeSec;
    this.time = timeSec;
    const w = this.field.width;
    if (this.easing.size > 0) {
      const k = 1 - Math.exp(-EASE_RATE * dt);
      for (const i of [...this.easing]) {
        const x = i % w;
        const y = Math.floor(i / w);
        const target = this.field.getConcentration(x, y);
        const next = Math.abs(target - this.display[i]) < SNAP ? target : this.display[i] + (target - this.display[i]) * k;
        this.display[i] = next;
        this.displayIds[i] = this.field.getGasId(x, y);
        this.dirty.add(this.chunkKey(x, y));
        if (next === target) this.easing.delete(i);
      }
    }
    const redrawn = new Set(this.dirty);
    this.render();
    for (const [key, chunk] of this.chunks) {
      if (chunk.drifting && !redrawn.has(key) && timeSec - chunk.lastDrawn >= DRIFT_REDRAW_SECONDS) this.drawChunk(key);
    }
  }

  private viewOf(key: number): ChunkView {
    let chunk = this.chunks.get(key);
    if (!chunk) {
      const root = new Container();
      const graphics = new Graphics();
      root.addChild(graphics);
      this.container.addChild(root);
      chunk = { root, graphics, drifting: false, lastDrawn: 0 };
      this.chunks.set(key, chunk);
    }
    return chunk;
  }

  private drawChunk(key: number): void {
    const chunkX = (key % this.chunksAcross) * GAS_CHUNK_SIZE;
    const chunkY = Math.floor(key / this.chunksAcross) * GAS_CHUNK_SIZE;
    const chunk = this.viewOf(key);
    const g = chunk.graphics;
    g.clear();
    let any = false;
    const tile = this.tileSize;
    for (let cy = chunkY; cy < Math.min(chunkY + GAS_CHUNK_SIZE, this.field.height); cy++) {
      for (let cx = chunkX; cx < Math.min(chunkX + GAS_CHUNK_SIZE, this.field.width); cx++) {
        const i = cy * this.field.width + cx;
        const concentration = this.display[i];
        if (concentration < GAS_VISIBLE_MIN) continue;
        const look = this.definitions.get(this.displayIds[i]);
        if (!look) continue;
        const { softness, driftSpeed, driftAmount } = look.appearance;
        const alpha = gasCellAlpha(look.opacity, concentration);
        const centre = gasBlobCentre(cx, cy, this.time, driftSpeed, driftAmount);
        if (softness <= 0.01) {
          g.rect(cx * tile, cy * tile, tile, tile).fill({ color: look.color, alpha });
          any = true;
          continue;
        }
        // A soft blob: a few stacked circles, the widest the faintest, so overlapping neighbours blend into a cloud
        const radius = gasBlobRadius(softness) * tile;
        for (const layer of GAS_BLOB_LAYERS) {
          g.circle(centre.x * tile, centre.y * tile, radius * layer.radius).fill({ color: look.color, alpha: alpha * layer.alpha });
        }
        any = true;
      }
    }
    chunk.drifting = any;
    chunk.lastDrawn = this.time;
    chunk.root.visible = any;
  }

  public destroy(): void {
    this.clearFlashes();
    for (const chunk of this.chunks.values()) chunk.root.destroy({ children: true });
    this.chunks.clear();
    this.dirty.clear();
    this.easing.clear();
  }
}
