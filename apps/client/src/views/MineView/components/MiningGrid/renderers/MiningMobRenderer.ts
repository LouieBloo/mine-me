import { Container, Graphics, Text } from 'pixi.js';
import { ModularEntitySprite } from '../../../../../components/game/sprites';
import { MINING_CONFIG, type MiningActiveMob, type MiningPosition, type Vector2D } from '@mine-me/shared';
import { TILE_SIZE } from './MiningTileRenderer';

export interface MobInstance {
  id: string;
  mobId: string;
  name: string;
  container: Container;
  sprite: ModularEntitySprite;
  nameplate: Text;
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
}

/**
 * Manages Pixi rendering, skeletal sprite instances, position interpolation,
 * health bars, and nameplates for active NPCs/mobs in the mining grid.
 */
export class MiningMobRenderer {
  private parentContainer: Container;
  private mobs: Map<string, MobInstance> = new Map();

  constructor(parentContainer: Container) {
    this.parentContainer = parentContainer;
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

    // 2. Add or update active mobs
    for (const mobData of activeMobs) {
      let instance = this.mobs.get(mobData.id);

      if (!instance) {
        const mobContainer = new Container();
        mobContainer.x = mobData.position.x * TILE_SIZE;
        mobContainer.y = mobData.position.y * TILE_SIZE;

        const nameplate = new Text({
          text: mobData.name || 'Mob',
          style: {
            fontFamily: 'Inter, system-ui, sans-serif',
            fontSize: 9,
            fontWeight: 'bold',
            fill: '#f87171',
            stroke: {
              color: '#450a0a',
              width: 2.5,
            },
          },
        });
        nameplate.anchor.set(0.5, 1);
        nameplate.position.set(0, -22);
        mobContainer.addChild(nameplate);

        const healthBar = new Graphics();
        this.drawHealthBar(healthBar, mobData.health, mobData.maxHealth);
        mobContainer.addChild(healthBar);

        const sprite = new ModularEntitySprite(mobContainer, {
          manifestData: mobData.animations?.parts ? mobData.animations : undefined,
        });

        instance = {
          id: mobData.id,
          mobId: mobData.mobId,
          name: mobData.name,
          container: mobContainer,
          sprite,
          nameplate,
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
      } else {
        instance.targetPos.x = mobData.position.x;
        instance.targetPos.y = mobData.position.y;
        instance.isFacingLeft = mobData.isFacingLeft;
        instance.animationState = mobData.animationState;
        instance.isMining = mobData.isMining;
        instance.miningTarget = mobData.miningTarget;

        if (instance.health !== mobData.health || instance.maxHealth !== mobData.maxHealth) {
          instance.health = mobData.health;
          instance.maxHealth = mobData.maxHealth;
          this.drawHealthBar(instance.healthBar, instance.health, instance.maxHealth);
        }
      }
    }
  }

  /**
   * Draw miniature health bar above mob's head.
   */
  private drawHealthBar(graphics: Graphics, health: number, maxHealth: number): void {
    graphics.clear();
    const barWidth = 26;
    const barHeight = 3;
    const x = -barWidth / 2;
    const y = -18;

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
   * Per-frame smooth interpolation and animation update for all mobs.
   */
  public tick(dt: number): void {
    const smoothFactor = Math.min(1.0, 1 - Math.exp(-24 * dt));

    for (const instance of this.mobs.values()) {
      instance.currentPos.x += (instance.targetPos.x - instance.currentPos.x) * smoothFactor;
      instance.currentPos.y += (instance.targetPos.y - instance.currentPos.y) * smoothFactor;

      instance.container.x = instance.currentPos.x * TILE_SIZE;
      instance.container.y = instance.currentPos.y * TILE_SIZE;

      if (instance.isLoaded) {
        instance.sprite.setFlipped(instance.isFacingLeft);
        instance.sprite.setState(instance.animationState as any);
        instance.sprite.update(dt);
      }
    }
  }

  private removeMob(id: string, instance: MobInstance): void {
    this.mobs.delete(id);
    try {
      this.parentContainer.removeChild(instance.container);
      instance.sprite.destroy();
      instance.container.destroy({ children: true });
    } catch {
      // Ignore destruction errors
    }
  }

  public destroy(): void {
    for (const [id, instance] of this.mobs) {
      this.removeMob(id, instance);
    }
  }
}
