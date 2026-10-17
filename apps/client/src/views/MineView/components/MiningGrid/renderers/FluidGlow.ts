import type { ItemLightConfig } from '@mine-me/shared';
import type { LightingEngine } from '../../../../../components/game/lighting/LightingEngine';
import type { LightSource } from '../../../../../components/game/lighting/LightSource';
import { createItemLight } from '../../../../../components/game/lighting/itemLight';
import type { FluidRenderer } from './FluidRenderer';
import { TILE_SIZE } from './MiningTileRenderer';

/** Most glow lights alive at once (lights are the costly part); the ones nearest the player win. */
export const MAX_GLOW_LIGHTS = 24;
/** How often the set of glow lights is brought up to date. */
export const GLOW_SYNC_INTERVAL_MS = 150;
/** Cells per light side: a lake is lit by one light per square this big, not one per cell. */
export const GLOW_BUCKET_SIZE = 4;
/** How far from the player (in tiles) fluid is considered for glowing; beyond this it is not on screen. */
export const GLOW_SCAN_RADIUS_X = 40;
export const GLOW_SCAN_RADIUS_Y = 26;
/** A bucket's light dims in this many steps as the fluid in it thins out (so lights are not rebuilt for every tiny change). */
const COVERAGE_STEPS = 4;

interface Bucket {
  key: string;
  fluidId: number;
  distance: number;
  x: number;
  y: number;
  /** How much of the bucket holds fluid, quantised to 1..COVERAGE_STEPS. */
  coverage: number;
  config: ItemLightConfig;
}

/**
 * The light fluids give off all the time (lava): its glow is data on the fluid, drawn through the lighting
 * engine like any other light. A big pool is lit by one light per `GLOW_BUCKET_SIZE` square of cells rather
 * than one per cell, dimmer where the bucket is only part fluid, and only fluid the player can have seen (the
 * client only holds revealed cells) glows. `sync` is called every frame and does its work a few times a second.
 */
export class FluidGlow {
  private readonly fluids: FluidRenderer;
  private readonly tileSize: number;
  private lighting: LightingEngine | null = null;
  private readonly lights = new Map<string, { light: LightSource; configKey: string }>();
  private lastSync = -Infinity;

  constructor(fluids: FluidRenderer, tileSize: number = TILE_SIZE) {
    this.fluids = fluids;
    this.tileSize = tileSize;
  }

  public setEngine(lighting: LightingEngine | null): void {
    if (this.lighting !== lighting) this.clear();
    this.lighting = lighting;
  }

  public get lightCount(): number {
    return this.lights.size;
  }

  /** Brings the lights up to date with the fluid, at most once per `GLOW_SYNC_INTERVAL_MS`. `focus` is a tile position (the player). */
  public sync(nowMs: number, focus: { x: number; y: number }): void {
    if (nowMs - this.lastSync < GLOW_SYNC_INTERVAL_MS) return;
    this.lastSync = nowMs;
    if (!this.lighting || !this.fluids.hasGlow) {
      if (this.lights.size > 0) this.clear();
      return;
    }

    const buckets = this.collectBuckets(focus);
    const wanted = new Map<string, Bucket>();
    for (const bucket of buckets) {
      if (wanted.size >= MAX_GLOW_LIGHTS) break;
      wanted.set(bucket.key, bucket);
    }

    for (const [key, entry] of this.lights) {
      const target = wanted.get(key);
      if (!target || FluidGlow.configKeyOf(target) !== entry.configKey) {
        this.lighting.removeLight(entry.light.id);
        this.lights.delete(key);
      }
    }
    for (const [key, bucket] of wanted) {
      const existing = this.lights.get(key);
      if (existing) {
        existing.light.setPosition(bucket.x, bucket.y);
      } else {
        const light = createItemLight(`fluid_glow_${key}`, FluidGlow.scaled(bucket), bucket.x, bucket.y);
        this.lighting.addLight(light);
        this.lights.set(key, { light, configKey: FluidGlow.configKeyOf(bucket) });
      }
    }
  }

  private static configKeyOf(bucket: Bucket): string {
    return `${bucket.coverage}:${JSON.stringify(bucket.config)}`;
  }

  /** The fluid's light, dimmed where only part of the bucket holds fluid. */
  private static scaled(bucket: Bucket): ItemLightConfig {
    const share = bucket.coverage / COVERAGE_STEPS;
    const dim = 0.4 + 0.6 * share;
    const config = bucket.config;
    return { ...config, intensity: (config.intensity ?? 0.5) * dim };
  }

  /** Groups the glowing fluid near the focus into buckets, nearest first. */
  private collectBuckets(focus: { x: number; y: number }): Bucket[] {
    const field = this.fluids.field;
    const x0 = Math.max(0, Math.floor(focus.x - GLOW_SCAN_RADIUS_X));
    const x1 = Math.min(field.width - 1, Math.ceil(focus.x + GLOW_SCAN_RADIUS_X));
    const y0 = Math.max(0, Math.floor(focus.y - GLOW_SCAN_RADIUS_Y));
    const y1 = Math.min(field.height - 1, Math.ceil(focus.y + GLOW_SCAN_RADIUS_Y));

    const groups = new Map<string, { fluidId: number; config: ItemLightConfig; sumX: number; sumY: number; weight: number; cells: number; topY: number }>();
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const fluidId = field.getFluidId(x, y);
        if (fluidId === 0) continue;
        const config = this.fluids.glowOf(fluidId);
        if (!config || config.enabled === false) continue;
        const level = Math.min(1, field.getLevel(x, y));
        if (level <= 0) continue;
        const key = `${fluidId}:${Math.floor(x / GLOW_BUCKET_SIZE)}:${Math.floor(y / GLOW_BUCKET_SIZE)}`;
        let group = groups.get(key);
        if (!group) {
          group = { fluidId, config, sumX: 0, sumY: 0, weight: 0, cells: 0, topY: Infinity };
          groups.set(key, group);
        }
        group.sumX += (x + 0.5) * level;
        group.sumY += (y + 0.5) * level;
        group.weight += level;
        group.cells += level;
        const surface = this.fluids.drawnSurfaceY(x, y);
        const top = surface === null ? y : surface / this.tileSize;
        if (top < group.topY) group.topY = top;
      }
    }

    const cellsPerBucket = GLOW_BUCKET_SIZE * GLOW_BUCKET_SIZE;
    const out: Bucket[] = [];
    for (const [key, group] of groups) {
      const x = group.sumX / group.weight;
      // At the average height of the fluid, but never lower than just under its highest surface, so a deep pool is lit from its top
      const averageY = group.sumY / group.weight;
      const y = Math.min(averageY, group.topY + 0.5) - 0.3;
      out.push({
        key,
        fluidId: group.fluidId,
        distance: Math.hypot(x - focus.x, y - focus.y),
        x,
        y,
        coverage: Math.min(COVERAGE_STEPS, Math.max(1, Math.ceil((group.cells / cellsPerBucket) * COVERAGE_STEPS))),
        config: group.config,
      });
    }
    out.sort((a, b) => a.distance - b.distance || (a.key < b.key ? -1 : 1));
    return out;
  }

  /** Removes every light (the engine stays). */
  public clear(): void {
    for (const entry of this.lights.values()) this.lighting?.removeLight(entry.light.id);
    this.lights.clear();
    this.lastSync = -Infinity;
  }

  public destroy(): void {
    this.clear();
    this.lighting = null;
  }
}
