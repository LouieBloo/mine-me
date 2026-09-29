import type { MiningActiveDynamite, MiningExplosionEvent, ParticleEffectConfig, Vector2D, ItemSoundEffectsConfig } from '@mine-me/shared';
import { DEFAULT_PARTICLE_EFFECTS, DEFAULT_DYNAMITE_SOUNDS } from '@mine-me/shared';
import { TILE_SIZE } from './MiningTileRenderer';
import type { ParticleEngine, EmitterHandle } from '../../../../../components/game/particles/ParticleEngine';
import type { LightingEngine } from '../../../../../components/game/lighting/LightingEngine';
import { PointLight } from '../../../../../components/game/lighting/PointLight';
import type { SoundManager } from '../../../../../services/sound';

interface ActiveExplosionFlash {
  id: string;
  light: PointLight;
  elapsed: number;
  duration: number;
  initialIntensity: number;
}

/**
 * Visual effects and lighting coordinator for thrown dynamites and explosions.
 * 
 * Manages:
 * 1. Pyrotechnic sparks radiating from the rotating dynamite fuse tip (middle right of sprite).
 * 2. Gentle flame sparks and an attached dynamic PointLight illuminating the surrounding cavern.
 * 3. Volumetric smoke cloud covering the explosion radius and dissipating over a couple seconds.
 */
export class DynamiteVisualManager {
  private static customConfigs: Map<string, ParticleEffectConfig> = new Map();
  private static customItems: Map<string, any> = new Map();
  private fuseEmitters: Map<string, { sparks: EmitterHandle; flames: EmitterHandle }> = new Map();
  private fuseLightIds: Set<string> = new Set();
  private activeFuseSoundKeys: Set<string> = new Set();
  private lastLocalThrowTime: number = 0;
  private explosionFlashes: ActiveExplosionFlash[] = [];
  private lastKnownDynamites: Map<string, MiningActiveDynamite> = new Map();

  /**
   * Records a local player throw to avoid duplicating throw sound when server acknowledges.
   */
  public recordLocalThrow(): void {
    this.lastLocalThrowTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
  }

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
   * Registers item definitions from the API to dynamically resolve custom item sound profiles.
   */
  public static setCustomItems(items: any[]): void {
    for (const item of items) {
      if (item.id) this.customItems.set(item.id, item);
      if (item.subType) {
        this.customItems.set(item.subType, item);
        this.customItems.set(item.subType.toUpperCase(), item);
      }
    }
  }

  /**
   * Retrieves sound configuration for an item ID or subType, falling back to DEFAULT_DYNAMITE_SOUNDS.
   */
  public static getItemSoundConfig(itemIdOrSubtype?: string): ItemSoundEffectsConfig {
    if (itemIdOrSubtype) {
      const found = this.customItems.get(itemIdOrSubtype) ?? this.customItems.get(itemIdOrSubtype.toUpperCase());
      if (found?.soundEffects) {
        return found.soundEffects;
      }
    }
    return DEFAULT_DYNAMITE_SOUNDS;
  }

  /**
   * Retrieves a particle effect config by key/id, checking custom/database configs first,
   * then falling back to DEFAULT_PARTICLE_EFFECTS.
   */
  public static getEffectConfig(key: string): ParticleEffectConfig {
    if (this.customConfigs.has(key)) {
      return this.customConfigs.get(key)!;
    }
    const defaultVal = (DEFAULT_PARTICLE_EFFECTS as Record<string, any>)[key];
    if (defaultVal) {
      return defaultVal;
    }
    const strippedKey = key.replace(/^pe_/, '');
    if (this.customConfigs.has(strippedKey)) {
      return this.customConfigs.get(strippedKey)!;
    }
    if ((DEFAULT_PARTICLE_EFFECTS as Record<string, any>)[strippedKey]) {
      return (DEFAULT_PARTICLE_EFFECTS as Record<string, any>)[strippedKey];
    }
    return DEFAULT_PARTICLE_EFFECTS.dynamite_fuse_sparks;
  }

  /**
   * Computes the world pixel and tile coordinates of the dynamite fuse tip.
   * On the 32px sprite (0.5 of a 64px tile, centered at anchor 0.5),
   * the fuse is located at the middle-right (+0.22 tiles, y=0).
   */
  public static calculateFuseWorldPosition(
    dyn: MiningActiveDynamite,
    tileSize: number = TILE_SIZE
  ): { pixel: Vector2D; tile: Vector2D } {
    const spriteWidth = tileSize * 0.5;
    // Local offset from center (middle-right of sprite image)
    const localX = spriteWidth * 0.44;
    const localY = 0;

    const angle = dyn.angle ?? 0;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    const pixelX = dyn.position.x * tileSize + (localX * cos - localY * sin);
    const pixelY = dyn.position.y * tileSize + (localX * sin + localY * cos);

    return {
      pixel: { x: pixelX, y: pixelY },
      tile: { x: pixelX / tileSize, y: pixelY / tileSize },
    };
  }

  /**
   * Frame ticker update:
   * - Updates positions of fuse sparks and flames for active dynamites.
   * - Updates position and illumination of fuse PointLights in the lighting engine.
   * - Cleans up emitters and lights for dynamites that have exploded or despawned.
   * - Animates and fades momentary explosion flash lights.
   */
  public update(
    activeDynamites: MiningActiveDynamite[],
    dt: number,
    particleEngine?: ParticleEngine | null,
    lightingEngine?: LightingEngine | null,
    tileSize: number = TILE_SIZE,
    soundManager?: SoundManager | null
  ): void {
    const currentKeys = new Set<string>();
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();

    for (const dyn of activeDynamites) {
      currentKeys.add(dyn.id);

      // Check for newly spawned dynamite that was NOT thrown locally (e.g. remote player throw)
      if (!this.lastKnownDynamites.has(dyn.id)) {
        if (now - this.lastLocalThrowTime > 800) {
          const remoteThrowSound = dyn.soundEffects?.throw?.url ?? DEFAULT_DYNAMITE_SOUNDS.throw?.url;
          if (remoteThrowSound && soundManager) {
            soundManager.playSfx(remoteThrowSound);
          }
        }
      }

      this.lastKnownDynamites.set(dyn.id, { ...dyn });

      const fusePos = DynamiteVisualManager.calculateFuseWorldPosition(dyn, tileSize);

      // 1. Particle Emitters (Sparks & Flame)
      if (particleEngine) {
        let handles = this.fuseEmitters.get(dyn.id);
        if (!handles) {
          const sparksConfig = DynamiteVisualManager.getEffectConfig(
            dyn.physicsConfig?.fuseSparksEffectId || 'dynamite_fuse_sparks'
          );
          const flamesConfig = DynamiteVisualManager.getEffectConfig(
            dyn.physicsConfig?.fuseFlamesEffectId || 'dynamite_fuse_flames'
          );

          const sparks = particleEngine.addEmitter(
            sparksConfig,
            fusePos.pixel,
            { stagger: false }
          );
          const flames = particleEngine.addEmitter(
            flamesConfig,
            fusePos.pixel,
            { stagger: false }
          );
          handles = { sparks, flames };
          this.fuseEmitters.set(dyn.id, handles);
        } else {
          handles.sparks.setPosition(fusePos.pixel);
          handles.flames.setPosition(fusePos.pixel);
        }
      }

      // 2. Light Source (Emits light from the burning flame/sparks)
      if (lightingEngine) {
        const lightId = `dynamite_fuse_${dyn.id}`;
        let light = lightingEngine.getLight(lightId) as PointLight | undefined;

        if (!light) {
          light = new PointLight(
            lightId,
            fusePos.tile,
            0xfbbf24, // warm glowing flame amber
            0.75,     // modest intensity ("not a ton of light but some")
            2.2,      // radius in cavern tiles
            {
              flicker: {
                speed: 24, // fast lively pyrotechnic flicker
                amount: 0.3,
              },
            }
          );
          lightingEngine.addLight(light);
          this.fuseLightIds.add(lightId);
        } else {
          light.setPosition(fusePos.tile.x, fusePos.tile.y);
          lightingEngine.markLightmapDirty();
        }
      }

      // 3. Audio Effect (Burning fuse ticking loop)
      if (soundManager) {
        const fuseKey = `dynamite_fuse_${dyn.id}`;
        const fuseConfig = dyn.soundEffects?.inGameEffect ?? DEFAULT_DYNAMITE_SOUNDS.inGameEffect;
        const fuseUrl = fuseConfig?.url;
        if (fuseUrl) {
          if (fuseConfig.loop !== false) {
            soundManager.playLoopingSfx(fuseKey, fuseUrl);
            this.activeFuseSoundKeys.add(fuseKey);
          } else if (!this.activeFuseSoundKeys.has(fuseKey)) {
            soundManager.playSfx(fuseUrl);
            this.activeFuseSoundKeys.add(fuseKey);
          }
        }
      }
    }

    // 4. Clean up dynamites that were removed or exploded
    this.fuseEmitters.forEach((handles, id) => {
      if (!currentKeys.has(id)) {
        handles.sparks.destroy();
        handles.flames.destroy();
        this.fuseEmitters.delete(id);
      }
    });

    this.fuseLightIds.forEach((lightId) => {
      const rawId = lightId.replace('dynamite_fuse_', '');
      if (!currentKeys.has(rawId)) {
        lightingEngine?.removeLight(lightId);
        this.fuseLightIds.delete(lightId);
      }
    });

    this.activeFuseSoundKeys.forEach((fuseKey) => {
      const rawId = fuseKey.replace('dynamite_fuse_', '');
      if (!currentKeys.has(rawId)) {
        soundManager?.stopLoopingSfx(fuseKey);
        this.activeFuseSoundKeys.delete(fuseKey);
      }
    });

    // 5. Update and decay active explosion flash lights
    if (this.explosionFlashes.length > 0 && lightingEngine) {
      this.explosionFlashes = this.explosionFlashes.filter((flash) => {
        flash.elapsed += dt;
        const progress = Math.min(1.0, flash.elapsed / flash.duration);
        const currentIntensity = flash.initialIntensity * (1.0 - progress);

        if (progress >= 1.0 || currentIntensity <= 0.01) {
          lightingEngine.removeLight(flash.id);
          return false;
        }

        flash.light.currentIntensity = currentIntensity;
        lightingEngine.markLightmapDirty();
        return true;
      });
    }
  }

  /**
   * Spawns an explosion effect:
   * - Volumetric smoke cloud covering the explosion radius that dissipates over a couple seconds.
   * - Explosive embers and blast wave particles.
   * - Momentary bright explosion flash light.
   * - Detonation sound effect.
   */
  public triggerExplosion(
    position: Vector2D,
    radius: number = 7,
    particleEngine?: ParticleEngine | null,
    lightingEngine?: LightingEngine | null,
    tileSize: number = TILE_SIZE,
    explosionId?: string,
    soundUrl?: string | null,
    soundManager?: SoundManager | null
  ): void {
    const centerPixel = {
      x: position.x * tileSize,
      y: position.y * tileSize,
    };

    const pixelRadius = Math.max(tileSize, radius * tileSize);

    // 1. Particle Cloud (Smoke and Flash)
    if (particleEngine) {
      const baseSmokeConfig = DynamiteVisualManager.getEffectConfig('dynamite_explosion_smoke');
      const flashConfig = DynamiteVisualManager.getEffectConfig('dynamite_explosion_flash');

      // Scaled smoke cloud covering the explosion radius
      const smokeConfig: ParticleEffectConfig = {
        ...baseSmokeConfig,
        spawnRadius: pixelRadius * 0.7,
        scale: {
          start: Math.max(1.8, (pixelRadius / 120) * 1.4),
          end: Math.max(3.8, (pixelRadius / 120) * 3.8),
        },
        burstCount: Math.min(110, Math.max(35, Math.round(radius * 12))),
        speed: {
          min: pixelRadius * 0.15,
          max: pixelRadius * 0.5,
        },
      };

      particleEngine.spawnBurst(smokeConfig, centerPixel);
      particleEngine.spawnBurst(flashConfig, centerPixel);
    }

    // 2. Momentary Explosion Flash Light
    if (lightingEngine) {
      const flashId = explosionId ? `exp_flash_${explosionId}` : `exp_flash_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      const flashLight = new PointLight(
        flashId,
        { x: position.x, y: position.y },
        0xffedd5, // bright fiery flash
        2.4,
        Math.max(2.5, radius * 1.15)
      );

      lightingEngine.addLight(flashLight);
      this.explosionFlashes.push({
        id: flashId,
        light: flashLight,
        elapsed: 0,
        duration: 0.35, // fast 350ms flash decay
        initialIntensity: 2.4,
      });
    }

    // 3. Explosion Sound Effect
    if (soundManager) {
      const resolvedSoundUrl = soundUrl || DEFAULT_DYNAMITE_SOUNDS.explosion?.url;
      if (resolvedSoundUrl) {
        soundManager.playSfx(resolvedSoundUrl, { throttleMs: 50 });
      }
    }
  }

  /**
   * Processes a list of authoritative explosion events received from the server.
   */
  public handleExplosionEvents(
    events: MiningExplosionEvent[],
    particleEngine?: ParticleEngine | null,
    lightingEngine?: LightingEngine | null,
    tileSize: number = TILE_SIZE,
    soundManager?: SoundManager | null
  ): void {
    for (const exp of events) {
      const soundUrl =
        exp.soundUrl ||
        this.lastKnownDynamites.get(exp.id)?.soundEffects?.explosion?.url ||
        DEFAULT_DYNAMITE_SOUNDS.explosion?.url;

      this.triggerExplosion(
        exp.position,
        exp.radius,
        particleEngine,
        lightingEngine,
        tileSize,
        exp.id,
        soundUrl,
        soundManager
      );
    }
  }

  /**
   * Cleans up all active emitters, lights, and looping audio on unmount.
   */
  public destroy(
    _particleEngine?: ParticleEngine | null,
    lightingEngine?: LightingEngine | null,
    soundManager?: SoundManager | null
  ): void {
    this.activeFuseSoundKeys.forEach((fuseKey) => {
      soundManager?.stopLoopingSfx(fuseKey);
    });
    this.activeFuseSoundKeys.clear();

    this.fuseEmitters.forEach((handles) => {
      handles.sparks.destroy();
      handles.flames.destroy();
    });
    this.fuseEmitters.clear();

    if (lightingEngine) {
      this.fuseLightIds.forEach((lightId) => {
        lightingEngine.removeLight(lightId);
      });
      this.explosionFlashes.forEach((flash) => {
        lightingEngine.removeLight(flash.id);
      });
    }

    this.fuseLightIds.clear();
    this.explosionFlashes = [];
    this.lastKnownDynamites.clear();
  }
}
