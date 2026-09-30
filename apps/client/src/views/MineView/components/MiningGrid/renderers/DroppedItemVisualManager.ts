import type { MiningDroppedItem, ParticleEffectConfig, ItemLightConfig } from '@mine-me/shared';
import { DEFAULT_PARTICLE_EFFECTS } from '@mine-me/shared';
import { TILE_SIZE } from './MiningTileRenderer';
import type { ParticleEngine, EmitterHandle } from '../../../../../components/game/particles/ParticleEngine';
import type { LightingEngine } from '../../../../../components/game/lighting/LightingEngine';
import type { LightSource } from '../../../../../components/game/lighting/LightSource';
import { PointLight } from '../../../../../components/game/lighting/PointLight';
import { SpotLight } from '../../../../../components/game/lighting/SpotLight';

/**
 * Visual effects and lighting coordinator for items dropped on the mine ground.
 * 
 * Manages:
 * 1. Dynamic in-game lighting (PointLight or SpotLight, with Static, Pulse, or Flicker modes)
 *    matching the exact configuration specified on the item's detail page.
 * 2. In-game continuous particle emissions (such as fairy sparkle, ember glow, etc.).
 * 
 * Crucial behavior:
 * - Both light and particle effects are strictly active only while dropped on the ground.
 * - When an item is picked up into the backpack or despawned, its light and emitter are cleanly destroyed.
 */
export class DroppedItemVisualManager {
  private static customConfigs: Map<string, ParticleEffectConfig> = new Map();
  private activeLights: Map<string, LightSource> = new Map();
  private activeEmitters: Map<string, EmitterHandle> = new Map();

  /**
   * Registers custom or database-defined particle effect configs fetched from the API.
   */
  public static setCustomParticleEffects(
    effects: { id?: string; name?: string; config: ParticleEffectConfig }[]
  ): void {
    for (const pe of effects) {
      if (pe.id) this.customConfigs.set(pe.id, pe.config);
      if (pe.name) {
        this.customConfigs.set(pe.name, pe.config);
        const normalizedKey = pe.name.toLowerCase().replace(/\s+/g, '_');
        this.customConfigs.set(normalizedKey, pe.config);
      }
    }
  }

  /**
   * Retrieves a particle effect config by key/id, checking custom/database configs first,
   * then falling back to DEFAULT_PARTICLE_EFFECTS.
   */
  public static getEffectConfig(key: string): ParticleEffectConfig | null {
    if (this.customConfigs.has(key)) {
      return this.customConfigs.get(key)!;
    }
    const normalized = key.toLowerCase().replace(/\s+/g, '_');
    if (this.customConfigs.has(normalized)) {
      return this.customConfigs.get(normalized)!;
    }

    // Check DEFAULT_PARTICLE_EFFECTS directly
    const defaultEffects = DEFAULT_PARTICLE_EFFECTS as Record<string, ParticleEffectConfig>;
    if (defaultEffects[key]) {
      return defaultEffects[key];
    }
    // Try stripping 'pe_' prefix (e.g., 'pe_fairy_sparkle' -> 'fairy_sparkle')
    const stripped = key.replace(/^pe_/, '');
    if (defaultEffects[stripped]) {
      return defaultEffects[stripped];
    }
    const strippedNormalized = normalized.replace(/^pe_/, '');
    if (defaultEffects[strippedNormalized]) {
      return defaultEffects[strippedNormalized];
    }

    return null;
  }

  /**
   * Parses color input (hex string like "#fbbf24" or number) into a numeric hex value.
   */
  public static parseColor(color?: string | number): number {
    if (typeof color === 'number') return color;
    if (typeof color === 'string') {
      const clean = color.replace('#', '');
      const parsed = parseInt(clean, 16);
      if (!isNaN(parsed)) return parsed;
    }
    return 0xfbbf24; // Default warm gold
  }

  /**
   * Updates dropped item lighting and particle emitters for the current frame.
   */
  public update(
    droppedItems: MiningDroppedItem[],
    _dt: number,
    particleEngine?: ParticleEngine | null,
    lightingEngine?: LightingEngine | null,
    tileSize: number = TILE_SIZE
  ): void {
    const activeKeys = new Set<string>();

    for (let idx = 0; idx < droppedItems.length; idx++) {
      const item = droppedItems[idx];
      const key = item.id || `${item.itemId}_${item.position.x}_${item.position.y}_${idx}`;
      activeKeys.add(key);

      // Tile coordinates and pixel coordinates
      const lightX = item.position.x + (Number.isInteger(item.position.x) ? 0.5 : 0);
      const lightY = item.position.y + (Number.isInteger(item.position.y) ? 0.5 : 0);
      const pixelX = lightX * tileSize;
      const pixelY = lightY * tileSize;

      // 1. Manage Dynamic Item Light
      this.updateItemLight(key, item.lightConfig, lightX, lightY, lightingEngine);

      // 2. Manage Dynamic Item Particle Emitter
      this.updateItemParticles(key, item.particleEffectId, pixelX, pixelY, particleEngine);
    }

    // Cleanup any lights or particles for items that were picked up or removed
    for (const [key, light] of this.activeLights.entries()) {
      if (!activeKeys.has(key)) {
        if (lightingEngine) {
          lightingEngine.removeLight(light.id);
        }
        this.activeLights.delete(key);
      }
    }

    for (const [key, emitter] of this.activeEmitters.entries()) {
      if (!activeKeys.has(key)) {
        emitter.destroy();
        this.activeEmitters.delete(key);
      }
    }
  }

  private updateItemLight(
    key: string,
    lightConfig: ItemLightConfig | null | undefined,
    lightX: number,
    lightY: number,
    lightingEngine?: LightingEngine | null
  ): void {
    const lightId = `dropped_item_light_${key}`;

    if (!lightConfig || !lightConfig.enabled) {
      if (this.activeLights.has(key)) {
        if (lightingEngine) {
          lightingEngine.removeLight(lightId);
        }
        this.activeLights.delete(key);
      }
      return;
    }

    const existingLight = this.activeLights.get(key);

    if (existingLight) {
      existingLight.setPosition(lightX, lightY);
      return;
    }

    if (!lightingEngine) return;

    const hexColor = DroppedItemVisualManager.parseColor(lightConfig.color);
    const radius = Math.max(0.5, lightConfig.radius ?? 1.8);
    const intensity = Math.max(0.05, lightConfig.intensity ?? 0.5);

    let createdLight: LightSource;

    if (lightConfig.type === 'SPOT') {
      const angleDeg = lightConfig.spotAngle ?? 90;
      const rad = (angleDeg * Math.PI) / 180;
      const direction = { x: Math.cos(rad), y: Math.sin(rad) };
      const coneAngle = lightConfig.spotConeAngle ?? 45;

      createdLight = new SpotLight(
        lightId,
        { x: lightX, y: lightY },
        direction,
        hexColor,
        intensity,
        radius,
        coneAngle
      );
    } else {
      // Default to POINT
      let options: {
        flicker?: { speed: number; amount: number };
        pulse?: { speed: number; minIntensity: number; maxIntensity: number };
      } | undefined;

      if (lightConfig.effect === 'PULSE') {
        options = {
          pulse: {
            speed: lightConfig.pulseSpeed ?? 2.5,
            minIntensity: lightConfig.minIntensity ?? Math.max(0.05, intensity * 0.6),
            maxIntensity: lightConfig.maxIntensity ?? (intensity * 1.3),
          },
        };
      } else if (lightConfig.effect === 'FLICKER') {
        options = {
          flicker: {
            speed: lightConfig.flickerSpeed ?? 12,
            amount: lightConfig.flickerAmount ?? 0.2,
          },
        };
      }

      createdLight = new PointLight(
        lightId,
        { x: lightX, y: lightY },
        hexColor,
        intensity,
        radius,
        options
      );
    }

    lightingEngine.addLight(createdLight);
    this.activeLights.set(key, createdLight);
  }

  private updateItemParticles(
    key: string,
    particleEffectId: string | null | undefined,
    pixelX: number,
    pixelY: number,
    particleEngine?: ParticleEngine | null
  ): void {
    if (!particleEffectId) {
      if (this.activeEmitters.has(key)) {
        this.activeEmitters.get(key)!.destroy();
        this.activeEmitters.delete(key);
      }
      return;
    }

    const existingEmitter = this.activeEmitters.get(key);

    if (existingEmitter) {
      existingEmitter.setPosition({ x: pixelX, y: pixelY });
      return;
    }

    if (!particleEngine) return;

    const config = DroppedItemVisualManager.getEffectConfig(particleEffectId);
    if (!config) return;

    const emitter = particleEngine.addEmitter(config, { x: pixelX, y: pixelY });
    this.activeEmitters.set(key, emitter);
  }

  /**
   * Destroys all active lights and particle emitters.
   */
  public destroy(
    _particleEngine?: ParticleEngine | null,
    lightingEngine?: LightingEngine | null
  ): void {
    for (const light of this.activeLights.values()) {
      if (lightingEngine) {
        lightingEngine.removeLight(light.id);
      }
    }
    this.activeLights.clear();

    for (const emitter of this.activeEmitters.values()) {
      emitter.destroy();
    }
    this.activeEmitters.clear();
  }

  public getActiveLightCount(): number {
    return this.activeLights.size;
  }

  public getActiveEmitterCount(): number {
    return this.activeEmitters.size;
  }
}
