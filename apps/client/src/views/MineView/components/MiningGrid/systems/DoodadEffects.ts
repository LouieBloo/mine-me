import { DEFAULT_DOODAD_MAX_LIGHTS, doodadLightConfig, dripLandedBetween, type DoodadEntry, type DoodadLightConfig, type ParticleEffectConfig } from '@mine-me/shared';
import type { LightingEngine } from '../../../../../components/game/lighting/LightingEngine';
import type { LightSource } from '../../../../../components/game/lighting/LightSource';
import { createItemLight } from '../../../../../components/game/lighting/itemLight';
import type { EmitterHandle, ParticleEngine } from '../../../../../components/game/particles/ParticleEngine';
import { DroppedItemVisualManager } from '../renderers/DroppedItemVisualManager';
import type { DoodadRenderer, DoodadViewInfo } from '../renderers/DoodadRenderer';
import { TILE_SIZE } from '../renderers/MiningTileRenderer';

/** How often the set of lights and emitters is brought up to date, in milliseconds. */
export const DOODAD_EFFECTS_SYNC_MS = 150;
/** Most continuous particle emitters alive at once; the nearest doodads win. */
export const MAX_DOODAD_EMITTERS = 24;

export type EffectResolver = (id: string) => ParticleEffectConfig | null;

/** Where the light or effect of a doodad is, in world pixels: its base point plus the offset (pixels of its own picture, mirrored with a wall doodad). */
export function doodadEffectPoint(info: DoodadViewInfo, offsetX: number | undefined, offsetY: number | undefined): { x: number; y: number } {
  return { x: info.anchorX + (offsetX ?? 0) * info.artScale * info.mirror, y: info.anchorY + (offsetY ?? 0) * info.artScale };
}

const keyOf = (entry: DoodadEntry): string => `${entry.x},${entry.y}`;

interface Candidate {
  info: DoodadViewInfo;
  distance: number;
}

/**
 * What doodads give off besides their picture (ticket 103): light and particles. Only the doodads the renderer has on screen
 * are considered, and the nearest to the player win a limited number of lights (a map setting) and emitters, so a cave full of
 * glowing mushrooms costs the same as a cave with a few. A doodad whose motion is `pulse` or `flicker` gets a light that does
 * the same (see `doodadLightConfig`); a `drip` splashes its effect where the drop lands instead of emitting all the time.
 */
export class DoodadEffects {
  private readonly renderer: DoodadRenderer;
  private readonly tileSize: number;
  private readonly resolveEffect: EffectResolver;
  private lighting: LightingEngine | null = null;
  private particles: ParticleEngine | null = null;
  private maxLights: number;
  private readonly lights = new Map<string, LightSource>();
  private readonly emitters = new Map<string, EmitterHandle>();
  private lastSync = -Infinity;
  private lastSeconds: number | null = null;

  constructor(renderer: DoodadRenderer, maxLights: number = DEFAULT_DOODAD_MAX_LIGHTS, resolveEffect: EffectResolver = (id) => DroppedItemVisualManager.getEffectConfig(id), tileSize: number = TILE_SIZE) {
    this.renderer = renderer;
    this.maxLights = Math.max(0, maxLights);
    this.resolveEffect = resolveEffect;
    this.tileSize = tileSize;
  }

  public setEngines(particles: ParticleEngine | null, lighting: LightingEngine | null): void {
    if (this.lighting !== lighting) this.clearLights();
    if (this.particles !== particles) this.clearEmitters();
    this.particles = particles;
    this.lighting = lighting;
  }

  public get lightCount(): number {
    return this.lights.size;
  }

  public get emitterCount(): number {
    return this.emitters.size;
  }

  /**
   * Call every frame. Splashes drips as their drops land, and about six times a second brings the lights and emitters up to
   * date. `focus` is the player's position in tiles, `nowMs` the clock of the frame.
   */
  public sync(nowMs: number, focus: { x: number; y: number }): void {
    const seconds = nowMs / 1000;
    const previous = this.lastSeconds;
    this.lastSeconds = seconds;
    const visible = this.renderer.visible();
    if (previous !== null) this.splashDrips(visible, previous, seconds);
    this.followWanderers(visible);

    if (nowMs - this.lastSync < DOODAD_EFFECTS_SYNC_MS) return;
    this.lastSync = nowMs;
    const candidates: Candidate[] = visible.map((info) => ({
      info,
      distance: Math.hypot(info.anchorX / this.tileSize - focus.x, info.anchorY / this.tileSize - focus.y),
    }));
    candidates.sort((a, b) => a.distance - b.distance || (keyOf(a.info.entry) < keyOf(b.info.entry) ? -1 : 1));
    this.syncLights(candidates);
    this.syncEmitters(candidates);
  }

  /** Moves the light and the emitter of each doodad that wanders along with it (ticket 106). */
  private followWanderers(visible: readonly DoodadViewInfo[]): void {
    if (this.lights.size === 0 && this.emitters.size === 0) return;
    for (const info of visible) {
      const def = info.entry.definition;
      if (!def.wander) continue;
      const key = keyOf(info.entry);
      const light = this.lights.get(key);
      if (light && def.light) {
        const point = doodadEffectPoint(info, def.light.offsetX, def.light.offsetY);
        light.setPosition(point.x / this.tileSize, point.y / this.tileSize);
      }
      this.emitters.get(key)?.setPosition(doodadEffectPoint(info, def.particleOffsetX, def.particleOffsetY));
    }
  }

  /** A puff of spores from a doodad that was brushed by a body (ticket 104): the effect the doodad names, once, where it gives off its particles. */
  public puff(info: DoodadViewInfo, effectId: string): void {
    const particles = this.particles;
    if (!particles) return;
    const config = this.resolveEffect(effectId);
    if (!config) return;
    const def = info.entry.definition;
    particles.spawnBurst(config, doodadEffectPoint(info, def.particleOffsetX, def.particleOffsetY));
  }

  private syncLights(candidates: readonly Candidate[]): void {
    const lighting = this.lighting;
    if (!lighting) return;
    const wanted = new Map<string, { info: DoodadViewInfo; config: DoodadLightConfig }>();
    for (const { info } of candidates) {
      if (wanted.size >= this.maxLights) break;
      const def = info.entry.definition;
      const config = doodadLightConfig(def.light, def.motion);
      if (config) wanted.set(keyOf(info.entry), { info, config });
    }
    for (const [key, light] of this.lights) {
      if (!wanted.has(key)) {
        lighting.removeLight(light.id);
        this.lights.delete(key);
      }
    }
    for (const [key, { info, config }] of wanted) {
      if (this.lights.has(key)) continue;
      const point = doodadEffectPoint(info, config.offsetX, config.offsetY);
      const light = createItemLight(`doodad_light_${key}`, config, point.x / this.tileSize, point.y / this.tileSize);
      lighting.addLight(light);
      this.lights.set(key, light);
    }
  }

  private syncEmitters(candidates: readonly Candidate[]): void {
    const particles = this.particles;
    if (!particles) return;
    const wanted = new Map<string, { info: DoodadViewInfo; config: ParticleEffectConfig }>();
    for (const { info } of candidates) {
      if (wanted.size >= MAX_DOODAD_EMITTERS) break;
      const def = info.entry.definition;
      // A drip splashes where its drop lands instead of emitting all the time
      if (!def.particleEffectId || def.motion?.preset === 'drip') continue;
      const config = this.resolveEffect(def.particleEffectId);
      if (config) wanted.set(keyOf(info.entry), { info, config });
    }
    for (const [key, emitter] of this.emitters) {
      if (!wanted.has(key)) {
        emitter.destroy();
        this.emitters.delete(key);
      }
    }
    for (const [key, { info, config }] of wanted) {
      if (this.emitters.has(key)) continue;
      const def = info.entry.definition;
      this.emitters.set(key, particles.addEmitter(config, doodadEffectPoint(info, def.particleOffsetX, def.particleOffsetY)));
    }
  }

  /** A splash of the doodad's effect at the offset, for each drip whose drop landed since the last frame. */
  private splashDrips(visible: readonly DoodadViewInfo[], from: number, to: number): void {
    const particles = this.particles;
    if (!particles) return;
    for (const info of visible) {
      const def = info.entry.definition;
      if (!def.particleEffectId || def.motion?.preset !== 'drip') continue;
      if (!dripLandedBetween(def.motion, from, to, info.phase)) continue;
      const config = this.resolveEffect(def.particleEffectId);
      if (config) particles.spawnBurst(config, doodadEffectPoint(info, def.particleOffsetX, def.particleOffsetY));
    }
  }

  private clearLights(): void {
    for (const light of this.lights.values()) this.lighting?.removeLight(light.id);
    this.lights.clear();
  }

  private clearEmitters(): void {
    for (const emitter of this.emitters.values()) emitter.destroy();
    this.emitters.clear();
  }

  public destroy(): void {
    this.clearLights();
    this.clearEmitters();
    this.lighting = null;
    this.particles = null;
  }
}
