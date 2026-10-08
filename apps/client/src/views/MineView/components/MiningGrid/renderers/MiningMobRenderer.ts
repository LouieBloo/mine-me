import { Assets, Container, Graphics, Sprite } from 'pixi.js';
import { FloatingTextManager, ModularEntitySprite } from '../../../../../components/game/sprites';
import {
  MINING_CONFIG,
  type MiningActiveMob,
  type MiningPosition,
  type Vector2D,
  getAssetUrl,
  MobSoundProfileRegistry,
  MINING_SPATIAL_AUDIO_PRESETS,
} from '@mine-me/shared';
import type { SoundManager } from '../../../../../services/sound';
import { TILE_SIZE } from './MiningTileRenderer';

export interface MobInstance {
  id: string;
  mobId: string;
  name: string;
  container: Container;
  sprite?: ModularEntitySprite;
  staticSprite?: Sprite;
  healthBar: Graphics;
  targetPos: Vector2D;
  currentPos: Vector2D;
  health: number;
  maxHealth: number;
  isFacingLeft: boolean;
  animationState: string;
  isMining: boolean;
  miningTarget?: MiningPosition | null;
  isLoaded: boolean;
  lastDigSoundTime: number;
  lastIdleSoundTime: number;
  colliderWidth?: number;
  colliderHeight?: number;
  showHealthBar?: boolean;
  hitWobbleTimer?: number;
}

/**
 * Manages Pixi rendering, skeletal sprite instances, position interpolation,
 * health bars, floating damage numbers, and spatial audio for active NPCs/mobs in the mining grid.
 */
export class MiningMobRenderer {
  private parentContainer: Container;
  private mobs: Map<string, MobInstance> = new Map();
  private soundManager: SoundManager | null = null;
  private floatingTextManager: FloatingTextManager | null = null;

  constructor(
    parentContainer: Container,
    soundManager?: SoundManager | null,
    floatingTextManager?: FloatingTextManager | null
  ) {
    this.parentContainer = parentContainer;
    this.soundManager = soundManager || null;
    this.floatingTextManager = floatingTextManager || null;
  }

  public setSoundManager(sm: SoundManager | null): void {
    this.soundManager = sm;
  }

  public setFloatingTextManager(ftm: FloatingTextManager | null): void {
    this.floatingTextManager = ftm;
  }

  public getMobCount(): number {
    return this.mobs.size;
  }

  public getMob(id: string): MobInstance | undefined {
    return this.mobs.get(id);
  }

  /**
   * Sync active mobs from server tick payload.
   */
  public updateMobs(activeMobs?: MiningActiveMob[]): void {
    if (!activeMobs || activeMobs.length === 0) {
      for (const [id, instance] of this.mobs) {
        this.removeMob(id, instance);
      }
      return;
    }

    const currentIds = new Set(activeMobs.map((m) => m.id));

    // 1. Remove mobs that are no longer active (defeated, despawned)
    for (const [id, instance] of this.mobs) {
      if (!currentIds.has(id)) {
        this.removeMob(id, instance);
      }
    }

    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();

    // 2. Add or update active mobs
    for (const mobData of activeMobs) {
      let instance = this.mobs.get(mobData.id);

      if (!instance) {
        const mobContainer = new Container();
        mobContainer.x = mobData.position.x * TILE_SIZE;
        mobContainer.y = mobData.position.y * TILE_SIZE;

        const healthBar = new Graphics();
        const showHealthBar = mobData.showHealthBar !== false;
        this.drawHealthBar(healthBar, mobData.health, mobData.maxHealth, showHealthBar);
        mobContainer.addChild(healthBar);

        const spriteUrl =
          mobData.spriteUrl ||
          (mobData.animations && !mobData.animations.parts ? mobData.animations.url : undefined);

        if (spriteUrl) {
          // Single-sprite entity (e.g. Target Dummy, static objects)
          const staticSprite = new Sprite();
          const colPixelH = (mobData.colliderHeight ?? 1.25) * TILE_SIZE;
          staticSprite.anchor.set(0.5, 1.0);
          staticSprite.y = colPixelH / 2;
          staticSprite.visible = false;
          mobContainer.addChild(staticSprite);

          instance = {
            id: mobData.id,
            mobId: mobData.mobId,
            name: mobData.name,
            container: mobContainer,
            staticSprite,
            healthBar,
            targetPos: { ...mobData.position },
            currentPos: { ...mobData.position },
            health: mobData.health,
            maxHealth: mobData.maxHealth,
            isFacingLeft: mobData.isFacingLeft,
            animationState: mobData.animationState,
            isMining: mobData.isMining,
            miningTarget: mobData.miningTarget,
            isLoaded: false,
            lastDigSoundTime: 0,
            lastIdleSoundTime: now + Math.random() * 3000,
            colliderWidth: mobData.colliderWidth,
            colliderHeight: mobData.colliderHeight,
            showHealthBar,
          };

          this.mobs.set(mobData.id, instance);
          this.parentContainer.addChild(mobContainer);

          Assets.load(getAssetUrl(spriteUrl))
            .then((texture) => {
              if (!this.mobs.has(mobData.id)) return;
              staticSprite.texture = texture;
              const targetHeight = (mobData.colliderHeight ?? 1.25) * TILE_SIZE * 1.05;
              const texW = texture?.width || 64;
              const texH = texture?.height || 64;
              const aspectRatio = texW / texH;
              try {
                staticSprite.height = targetHeight;
                staticSprite.width = targetHeight * aspectRatio;
              } catch {
                // Safe fallback for headless unit test environments
              }
              staticSprite.visible = true;
              instance!.isLoaded = true;
            })
            .catch((err) => {
              console.error('[MiningMobRenderer] Error loading static sprite for mob:', mobData.id, err);
            });
        } else {
          // Modular entity skeletal puppet (e.g. Mole Person)
          const sprite = new ModularEntitySprite(mobContainer, {
            manifestData: mobData.animations?.parts ? mobData.animations : undefined,
          });

          instance = {
            id: mobData.id,
            mobId: mobData.mobId,
            name: mobData.name,
            container: mobContainer,
            sprite,
            healthBar,
            targetPos: { ...mobData.position },
            currentPos: { ...mobData.position },
            health: mobData.health,
            maxHealth: mobData.maxHealth,
            isFacingLeft: mobData.isFacingLeft,
            animationState: mobData.animationState,
            isMining: mobData.isMining,
            miningTarget: mobData.miningTarget,
            isLoaded: false,
            lastDigSoundTime: 0,
            lastIdleSoundTime: now + Math.random() * 3000,
            colliderWidth: mobData.colliderWidth,
            colliderHeight: mobData.colliderHeight,
            showHealthBar,
          };

          this.mobs.set(mobData.id, instance);
          this.parentContainer.addChild(mobContainer);

          sprite
            .load()
            .then(() => {
              if (!this.mobs.has(mobData.id)) return;
              const targetHeight = TILE_SIZE * 1.05;
              sprite.scaleToHeight(targetHeight);

              const unscaledFootDepth = 426;
              const visualGroundOffset = 15;
              const footOffset =
                MINING_CONFIG.PLAYER_RADIUS -
                unscaledFootDepth * (targetHeight / ModularEntitySprite.REFERENCE_HEIGHT) +
                visualGroundOffset;
              sprite.setPosition(0, footOffset);

              sprite.setFlipped(instance!.isFacingLeft);
              sprite.setVisible(true);
              instance!.isLoaded = true;
            })
            .catch((err) => {
              console.error('[MiningMobRenderer] Error loading sprite for mob:', mobData.id, err);
            });
        }
      } else {
        instance.targetPos.x = mobData.position.x;
        instance.targetPos.y = mobData.position.y;
        instance.isFacingLeft = mobData.isFacingLeft;
        instance.animationState = mobData.animationState;
        instance.isMining = mobData.isMining;
        instance.miningTarget = mobData.miningTarget;
        if (mobData.colliderWidth) instance.colliderWidth = mobData.colliderWidth;
        if (mobData.colliderHeight) instance.colliderHeight = mobData.colliderHeight;
        if (mobData.showHealthBar !== undefined) instance.showHealthBar = mobData.showHealthBar;

        // Mob took damage
        if (mobData.health < instance.health) {
          const damageTaken = instance.health - mobData.health;

          // Spawn floating damage text via standardized FloatingTextManager
          if (this.floatingTextManager) {
            const spawnX = instance.currentPos.x * TILE_SIZE;
            const spawnY = (instance.currentPos.y - 0.7) * TILE_SIZE;
            this.floatingTextManager.spawnDamage(spawnX, spawnY, damageTaken);
          }

          // Trigger hit wobble animation on static sprite
          if (instance.staticSprite) {
            instance.hitWobbleTimer = 220;
          }

          const profile = MobSoundProfileRegistry.getProfile(instance.mobId);
          const damageSound = profile?.getSlot('damage')?.defaultUrl;
          if (damageSound && this.soundManager) {
            const soundPos = { x: instance.currentPos.x + 0.5, y: instance.currentPos.y + 0.5 };
            if (typeof this.soundManager.playPositionalSfx === 'function') {
              this.soundManager.playPositionalSfx(damageSound, soundPos, {
                spatial: MINING_SPATIAL_AUDIO_PRESETS.MOB_DAMAGE,
              });
            } else {
              this.soundManager.playSfx(damageSound, {
                position: soundPos,
                spatial: MINING_SPATIAL_AUDIO_PRESETS.MOB_DAMAGE,
              });
            }
          }
        }

        if (instance.health !== mobData.health || instance.maxHealth !== mobData.maxHealth) {
          instance.health = mobData.health;
          instance.maxHealth = mobData.maxHealth;
          this.drawHealthBar(instance.healthBar, instance.health, instance.maxHealth, instance.showHealthBar);
        }
      }
    }
  }

  /**
   * Draw miniature health bar above mob's head.
   * Only rendered if the mob has taken damage and is still alive, and showHealthBar is not false.
   */
  private drawHealthBar(graphics: Graphics, health: number, maxHealth: number, showHealthBar: boolean = true): void {
    graphics.clear();

    if (!showHealthBar || health >= maxHealth || health <= 0) {
      graphics.visible = false;
      return;
    }
    graphics.visible = true;

    const barWidth = 28;
    const barHeight = 4;
    const x = -barWidth / 2;
    const y = -50; // Positioned cleanly above the mob's head

    // Background track
    graphics.rect(x, y, barWidth, barHeight);
    graphics.fill(0x1e293b);

    // Current health bar fill
    const healthRatio = Math.max(0, Math.min(1, health / (maxHealth || 1)));
    if (healthRatio > 0) {
      const fillColor = healthRatio > 0.5 ? 0x22c55e : healthRatio > 0.25 ? 0xeab308 : 0xef4444;
      graphics.rect(x, y, barWidth * healthRatio, barHeight);
      graphics.fill(fillColor);
    }

    // Border
    graphics.rect(x, y, barWidth, barHeight);
    graphics.stroke({ color: 0x0f172a, width: 1 });
  }

  /**
   * Per-frame smooth interpolation, animation update, and audio triggers for all mobs.
   */
  public tick(dt: number, soundManager?: SoundManager | null): void {
    if (soundManager !== undefined) {
      this.soundManager = soundManager;
    }

    const smoothFactor = Math.min(1.0, 1 - Math.exp(-24 * dt));
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();

    for (const instance of this.mobs.values()) {
      instance.currentPos.x += (instance.targetPos.x - instance.currentPos.x) * smoothFactor;
      instance.currentPos.y += (instance.targetPos.y - instance.currentPos.y) * smoothFactor;

      instance.container.x = instance.currentPos.x * TILE_SIZE;
      instance.container.y = instance.currentPos.y * TILE_SIZE;

      if (instance.isLoaded) {
        if (instance.sprite) {
          instance.sprite.setFlipped(instance.isFacingLeft);
          instance.sprite.setState(instance.animationState as any);
          instance.sprite.update(dt);
        } else if (instance.staticSprite) {
          instance.staticSprite.scale.x = instance.isFacingLeft
            ? -Math.abs(instance.staticSprite.scale.x)
            : Math.abs(instance.staticSprite.scale.x);

          if (instance.hitWobbleTimer && instance.hitWobbleTimer > 0) {
            instance.hitWobbleTimer -= dt * 1000;
            instance.staticSprite.rotation = Math.sin(instance.hitWobbleTimer * 0.05) * 0.12;
          } else {
            instance.staticSprite.rotation = 0;
          }
        }
      }

      // Audio triggers
      if (this.soundManager) {
        const profile = MobSoundProfileRegistry.getProfile(instance.mobId);
        const soundPos = { x: instance.currentPos.x + 0.5, y: instance.currentPos.y + 0.5 };

        // 1. Digging / Clawing sound
        const isCurrentlyMining = instance.isMining || instance.animationState === 'mine';
        if (isCurrentlyMining) {
          if (now - instance.lastDigSoundTime >= 360) {
            instance.lastDigSoundTime = now;
            const digSound = profile?.getSlot('dig')?.defaultUrl;
            if (digSound) {
              if (typeof this.soundManager.playPositionalSfx === 'function') {
                this.soundManager.playPositionalSfx(digSound, soundPos, {
                  spatial: MINING_SPATIAL_AUDIO_PRESETS.MOB_DIGGING,
                });
              } else {
                this.soundManager.playSfx(digSound, {
                  position: soundPos,
                  spatial: MINING_SPATIAL_AUDIO_PRESETS.MOB_DIGGING,
                });
              }
            }
          }
        }

        // 2. Ambient idle snuffle sound
        if (instance.animationState === 'idle' && !isCurrentlyMining) {
          if (now - instance.lastIdleSoundTime >= 6500) {
            instance.lastIdleSoundTime = now + (Math.random() * 2000 - 1000);
            const idleSound = profile?.getSlot('idle')?.defaultUrl;
            if (idleSound) {
              if (typeof this.soundManager.playPositionalSfx === 'function') {
                this.soundManager.playPositionalSfx(idleSound, soundPos, {
                  spatial: MINING_SPATIAL_AUDIO_PRESETS.MOB_IDLE,
                });
              } else {
                this.soundManager.playSfx(idleSound, {
                  position: soundPos,
                  spatial: MINING_SPATIAL_AUDIO_PRESETS.MOB_IDLE,
                });
              }
            }
          }
        }
      }
    }
  }

  private removeMob(id: string, instance: MobInstance): void {
    this.mobs.delete(id);
    try {
      this.parentContainer.removeChild(instance.container);
      if (instance.sprite) {
        instance.sprite.destroy();
      }
      instance.container.destroy({ children: true });
    } catch {
      // Ignore destruction errors
    }
  }

  /**
   * Render debug hitboxes, collision boxes, and reach indicators for all active mobs.
   */
  public renderDebugHitboxes(debugGraphics: Graphics, tileSize: number = TILE_SIZE): void {
    const defaultW = (MINING_CONFIG.PLAYER_COLLIDER_WIDTH / MINING_CONFIG.TILE_SIZE) * tileSize;
    const defaultH = (MINING_CONFIG.PLAYER_COLLIDER_HEIGHT / MINING_CONFIG.TILE_SIZE) * tileSize;

    for (const instance of this.mobs.values()) {
      const colliderPixelW = instance.colliderWidth ? instance.colliderWidth * tileSize : defaultW;
      const colliderPixelH = instance.colliderHeight ? instance.colliderHeight * tileSize : defaultH;

      const mobX = instance.currentPos.x * tileSize;
      const mobY = instance.currentPos.y * tileSize;

      // 1. AABB Collider Box (Red outline + translucent red fill)
      debugGraphics.rect(
        mobX - colliderPixelW / 2,
        mobY - colliderPixelH / 2,
        colliderPixelW,
        colliderPixelH
      );
      debugGraphics.stroke({ width: 2, color: 0xef4444, alpha: 0.9 });
      debugGraphics.fill({ color: 0xef4444, alpha: 0.15 });

      // 2. Ground / Foot Contact Line (Dark red)
      const feetY = mobY + colliderPixelH / 2;
      debugGraphics.moveTo(mobX - colliderPixelW / 2, feetY);
      debugGraphics.lineTo(mobX + colliderPixelW / 2, feetY);
      debugGraphics.stroke({ width: 2, color: 0xdc2626, alpha: 1 });

      // 3. Center Origin Point (Bright red dot)
      debugGraphics.circle(mobX, mobY, 3);
      debugGraphics.fill({ color: 0xf87171, alpha: 1 });

      // 4. Facing Direction Indicator (Yellow line pointing forward)
      const dirX = instance.isFacingLeft ? -1 : 1;
      debugGraphics.moveTo(mobX, mobY);
      debugGraphics.lineTo(mobX + dirX * (colliderPixelW / 2 + 8), mobY);
      debugGraphics.stroke({ width: 2, color: 0xfacc15, alpha: 0.95 });

      // 5. Mining Target Highlight & Line
      if (instance.isMining && instance.miningTarget) {
        const targetX = instance.miningTarget.x * tileSize;
        const targetY = instance.miningTarget.y * tileSize;
        debugGraphics.rect(targetX, targetY, tileSize, tileSize);
        debugGraphics.stroke({ width: 2, color: 0xf97316, alpha: 0.9 });
        debugGraphics.fill({ color: 0xf97316, alpha: 0.15 });

        debugGraphics.moveTo(mobX, mobY);
        debugGraphics.lineTo(targetX + tileSize / 2, targetY + tileSize / 2);
        debugGraphics.stroke({ width: 1.5, color: 0xf97316, alpha: 0.75 });
      }
    }
  }

  public destroy(): void {
    for (const [id, instance] of this.mobs) {
      this.removeMob(id, instance);
    }
  }
}
