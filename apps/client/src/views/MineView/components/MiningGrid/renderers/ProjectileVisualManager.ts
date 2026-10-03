import type { MiningGunshotEvent, Vector2D } from '@mine-me/shared';
import { DEFAULT_PARTICLE_EFFECTS } from '@mine-me/shared';
import type { ParticleEngine } from '../../../../../components/game/particles/ParticleEngine';
import type { LightingEngine } from '../../../../../components/game/lighting/LightingEngine';
import { PointLight } from '../../../../../components/game/lighting/PointLight';
import type { SoundManager } from '../../../../../services/sound';

interface ActiveMuzzleFlashLight {
  id: string;
  light: PointLight;
  elapsed: number;
  duration: number;
  initialIntensity: number;
}

/**
 * Visual effects, audio, and dynamic lighting coordinator for projectile weapons (e.g. 6-shooter revolver).
 *
 * Responsibilities:
 * 1. Spawns particle effects: muzzle flash burst and gun smoke trail when fired.
 * 2. Adds dynamic momentary light flashes that illuminate the mine cavern on firing.
 * 3. Plays spatial gunshot sound effects for both local player and remote players.
 */
export class ProjectileVisualManager {
  private activeFlashes: ActiveMuzzleFlashLight[] = [];
  private lastLocalShotTime: number = 0;
  private processedGunshotIds: Set<string> = new Set();

  /**
   * Records a local player shot timestamp to prevent echoing audio on server broadcast acknowledgment.
   */
  public recordLocalShot(): void {
    this.lastLocalShotTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
  }

  /**
   * Triggers immediate local audiovisual feedback (zero network latency) when the player pulls the trigger.
   */
  public triggerLocalShot(
    muzzlePos: Vector2D,
    angle: number,
    soundUrl?: string | null,
    particleEngine?: ParticleEngine | null,
    lightingEngine?: LightingEngine | null,
    soundManager?: SoundManager | null,
    tileSize: number = 48
  ): void {
    this.recordLocalShot();

    // 1. Immediate local audio
    if (soundManager && soundUrl) {
      if (typeof soundManager.playPositionalSfx === 'function') {
        soundManager.playPositionalSfx(soundUrl, muzzlePos);
      } else {
        soundManager.playSfx(soundUrl);
      }
    }

    // 2. Muzzle flash & smoke particles (in world pixel coordinates)
    if (particleEngine) {
      const pixelPos = {
        x: muzzlePos.x * tileSize,
        y: muzzlePos.y * tileSize,
      };

      const angleDeg = (angle * 180) / Math.PI;

      const muzzleFlashConfig = {
        ...DEFAULT_PARTICLE_EFFECTS.gun_muzzle_flash,
        angle: {
          min: angleDeg - 25,
          max: angleDeg + 25,
        },
      };

      const smokeConfig = {
        ...DEFAULT_PARTICLE_EFFECTS.gun_smoke,
        angle: {
          min: angleDeg - 35,
          max: angleDeg + 35,
        },
      };

      particleEngine.spawnBurst(muzzleFlashConfig, pixelPos);
      particleEngine.spawnBurst(smokeConfig, pixelPos);
    }

    // 3. Dynamic momentary light source
    if (lightingEngine) {
      this.addMuzzleFlashLight(muzzlePos, lightingEngine);
    }
  }

  /**
   * Processes server-authoritative gunshot events arriving on state ticks.
   * Plays positional audio for remote shooters and ensures visual effects appear for all spectators.
   */
  public handleGunshotEvents(
    gunshots: MiningGunshotEvent[],
    localCharacterId?: string,
    particleEngine?: ParticleEngine | null,
    lightingEngine?: LightingEngine | null,
    soundManager?: SoundManager | null,
    tileSize: number = 48
  ): void {
    if (!gunshots || gunshots.length === 0) return;

    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();

    for (const shot of gunshots) {
      // Avoid duplicate processing if we already handled this shot ID
      if (this.processedGunshotIds.has(shot.id)) continue;
      this.processedGunshotIds.add(shot.id);

      // Keep processed cache from growing indefinitely
      if (this.processedGunshotIds.size > 200) {
        const first = this.processedGunshotIds.values().next().value;
        if (first) this.processedGunshotIds.delete(first);
      }

      const isLocalShooter = Boolean(localCharacterId && shot.characterId === localCharacterId);
      const isVeryRecentLocal = isLocalShooter && now - this.lastLocalShotTime < 350;

      const shotPos = shot.muzzlePosition ?? shot.position;

      // Remote player gunshot: play positional audio if weapon has sound configured
      if (!isVeryRecentLocal && soundManager && shot.soundUrl) {
        if (typeof soundManager.playPositionalSfx === 'function') {
          soundManager.playPositionalSfx(shot.soundUrl, shotPos);
        } else {
          soundManager.playSfx(shot.soundUrl);
        }
      }

      // If remote player fired, spawn muzzle flash, smoke, and dynamic light for spectators
      if (!isVeryRecentLocal) {
        if (particleEngine) {
          const pixelPos = {
            x: shotPos.x * tileSize,
            y: shotPos.y * tileSize,
          };
          const angle = shot.direction ? Math.atan2(shot.direction.y, shot.direction.x) : 0;
          const angleDeg = (angle * 180) / Math.PI;

          const flashConfig = {
            ...DEFAULT_PARTICLE_EFFECTS.gun_muzzle_flash,
            angle: { min: angleDeg - 25, max: angleDeg + 25 },
          };
          const smokeConfig = {
            ...DEFAULT_PARTICLE_EFFECTS.gun_smoke,
            angle: { min: angleDeg - 35, max: angleDeg + 35 },
          };
          particleEngine.spawnBurst(flashConfig, pixelPos);
          particleEngine.spawnBurst(smokeConfig, pixelPos);
        }

        if (lightingEngine) {
          this.addMuzzleFlashLight(shotPos, lightingEngine);
        }
      }
    }
  }

  /**
   * Adds an intense, short-lived point light at the muzzle position that illuminates the cave.
   */
  private addMuzzleFlashLight(muzzlePos: Vector2D, lightingEngine: LightingEngine): void {
    const flashId = `gun_flash_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const initialIntensity = 2.4;
    const duration = 0.14; // 140ms decay

    const light = new PointLight(
      flashId,
      { x: muzzlePos.x, y: muzzlePos.y },
      0xfff2a3, // Brilliant white-amber muzzle flash color
      initialIntensity,
      4.5 // Generous illumination radius
    );

    lightingEngine.addLight(light);
    this.activeFlashes.push({
      id: flashId,
      light,
      elapsed: 0,
      duration,
      initialIntensity,
    });
  }

  /**
   * Adds an instantaneous incandescent impact spark flash light at projectile impact coordinate.
   */
  public addImpactFlashLight(
    impactPos: Vector2D,
    lightingEngine: LightingEngine
  ): void {
    const flashId = `impact_flash_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const duration = 0.08;
    const initialIntensity = 1.8;

    const light = new PointLight(
      flashId,
      { x: impactPos.x, y: impactPos.y },
      0xfbbf24,
      initialIntensity,
      2.5
    );

    lightingEngine.addLight(light);
    this.activeFlashes.push({
      id: flashId,
      light,
      elapsed: 0,
      duration,
      initialIntensity,
    });
  }

  /**
   * Advances active flash lifetimes each frame, linearly decaying their intensity and removing expired lights.
   */
  public update(dt: number, lightingEngine?: LightingEngine | null): void {
    if (this.activeFlashes.length === 0) return;

    for (let i = this.activeFlashes.length - 1; i >= 0; i--) {
      const flash = this.activeFlashes[i];
      flash.elapsed += dt;

      if (flash.elapsed >= flash.duration) {
        if (lightingEngine) {
          lightingEngine.removeLight(flash.id);
        }
        this.activeFlashes.splice(i, 1);
      } else {
        const progress = flash.elapsed / flash.duration;
        flash.light.setIntensity(flash.initialIntensity * (1 - progress));
        if (lightingEngine) {
          lightingEngine.addLight(flash.light);
        }
      }
    }
  }

  /**
   * Cleans up all active lights on unmount.
   */
  public destroy(lightingEngine?: LightingEngine | null): void {
    if (lightingEngine) {
      for (const flash of this.activeFlashes) {
        lightingEngine.removeLight(flash.id);
      }
    }
    this.activeFlashes = [];
    this.processedGunshotIds.clear();
  }
}
export default ProjectileVisualManager;
