import { Assets, Graphics, Sprite, Texture, Container } from 'pixi.js';
import { getAssetUrl, type MiningDroppedItem, type MiningActiveDynamite, type MiningActiveProjectile } from '@mine-me/shared';
import { TILE_SIZE } from './MiningTileRenderer';

export interface ActiveFallingRock {
  id: string;
  x: number;
  y: number;
  angle?: number;
}

export class MiningEntityRenderer {
  public static updateDroppedItems(
    droppedItemsContainer: Container,
    droppedItems: MiningDroppedItem[],
    droppedSpritesMap: Map<string, Sprite | Graphics>,
    tileSize: number = TILE_SIZE
  ): void {
    const nextKeys = new Set<string>();

    droppedItems.forEach((item, idx) => {
      const key = item.id || `${item.itemId}_${item.position.x}_${item.position.y}_${idx}`;
      nextKeys.add(key);

      const itemX = item.id
        ? item.position.x * tileSize
        : (Number.isInteger(item.position.x) ? item.position.x * tileSize + tileSize / 2 : item.position.x * tileSize);
      const itemY = item.id
        ? item.position.y * tileSize
        : (Number.isInteger(item.position.y) ? item.position.y * tileSize + tileSize / 2 : item.position.y * tileSize);

      const spriteUrl = item.inGameSpriteUrl || item.iconUrl;
      const existing = droppedSpritesMap.get(key);

      const itemScale = typeof item.inGameScale === 'number' && item.inGameScale > 0 ? item.inGameScale : 1.0;
      const targetSize = tileSize * 0.5 * itemScale;

      if (existing) {
        existing.x = itemX;
        existing.y = itemY;
        // Keep dimensions updated if scale changes dynamically
        if (existing instanceof Sprite) {
          existing.width = targetSize;
          existing.height = targetSize;
        }
      } else {
        if (spriteUrl) {
          const loadSprite = async () => {
            try {
              const url = getAssetUrl(spriteUrl);
              const texture = await Assets.load(url);
              const sprite = new Sprite(texture);
              sprite.anchor.set(0.5);
              sprite.width = targetSize;
              sprite.height = targetSize;
              sprite.x = itemX;
              sprite.y = itemY;
              droppedItemsContainer.addChild(sprite);
              droppedSpritesMap.set(key, sprite);
            } catch {
              const graphics = new Graphics();
              graphics.rect(-targetSize / 2, -targetSize / 2, targetSize, targetSize);
              graphics.fill(0xf59e0b);
              graphics.x = itemX;
              graphics.y = itemY;
              droppedItemsContainer.addChild(graphics);
              droppedSpritesMap.set(key, graphics);
            }
          };
          loadSprite();
        } else {
          const graphics = new Graphics();
          graphics.rect(-targetSize / 2, -targetSize / 2, targetSize, targetSize);
          graphics.fill(0xf59e0b);
          graphics.x = itemX;
          graphics.y = itemY;
          droppedItemsContainer.addChild(graphics);
          droppedSpritesMap.set(key, graphics);
        }
      }
    });

    droppedSpritesMap.forEach((sprite, key) => {
      if (!nextKeys.has(key)) {
        droppedItemsContainer.removeChild(sprite);
        sprite.destroy();
        droppedSpritesMap.delete(key);
      }
    });
  }

  public static updateFallingRocks(
    fallingRocksContainer: Container,
    fallingRocks: ActiveFallingRock[],
    fallingRockGraphicsMap: Map<string, Sprite | Graphics>,
    tileSize: number = TILE_SIZE,
    rockTexture?: Texture | null
  ): void {
    const activeRockKeys = new Set<string>();

    for (const rock of fallingRocks) {
      activeRockKeys.add(rock.id);
      let rockView = fallingRockGraphicsMap.get(rock.id);

      if (rockTexture) {
        // If we have a texture and the current view isn't a Sprite, replace it
        if (!rockView || !(rockView instanceof Sprite)) {
          if (rockView) {
            fallingRocksContainer.removeChild(rockView);
            rockView.destroy();
          }
          const sprite = new Sprite(rockTexture);
          sprite.anchor.set(0.5);
          sprite.width = tileSize;
          sprite.height = tileSize;
          fallingRocksContainer.addChild(sprite);
          rockView = sprite;
          fallingRockGraphicsMap.set(rock.id, rockView);
        } else if (rockView.texture !== rockTexture) {
          rockView.texture = rockTexture;
        }
      } else {
        // Fallback: draw textured/styled graphics if texture not loaded
        if (!rockView || rockView instanceof Sprite) {
          if (rockView) {
            fallingRocksContainer.removeChild(rockView);
            rockView.destroy();
          }
          const graphics = new Graphics();
          graphics.roundRect(-tileSize * 0.45, -tileSize * 0.45, tileSize * 0.9, tileSize * 0.9, 4);
          graphics.fill(0x475569);
          fallingRocksContainer.addChild(graphics);
          rockView = graphics;
          fallingRockGraphicsMap.set(rock.id, rockView);
        }
      }

      // rock.x and rock.y are centered coordinates
      rockView.x = rock.x * tileSize;
      rockView.y = rock.y * tileSize;
      if (typeof rock.angle === 'number') {
        rockView.rotation = rock.angle;
      }
    }

    // Clean up graphics/sprites for rocks that have settled back into grid
    fallingRockGraphicsMap.forEach((view, id) => {
      if (!activeRockKeys.has(id)) {
        fallingRocksContainer.removeChild(view);
        view.destroy();
        fallingRockGraphicsMap.delete(id);
      }
    });
  }

  public static updateActiveDynamites(
    dynamitesContainer: Container,
    activeDynamites: MiningActiveDynamite[],
    dynamiteGraphicsMap: Map<string, Sprite | Graphics>,
    tileSize: number = TILE_SIZE,
    dynamiteTexture?: Texture | null
  ): void {
    const activeKeys = new Set<string>();

    for (const dynamite of activeDynamites) {
      activeKeys.add(dynamite.id);
      let view = dynamiteGraphicsMap.get(dynamite.id);

      const dynamiteScale = typeof dynamite.inGameScale === 'number' && dynamite.inGameScale > 0 ? dynamite.inGameScale : 1.0;
      const targetSize = tileSize * 0.5 * dynamiteScale;

      if (dynamiteTexture) {
        if (!view || !(view instanceof Sprite)) {
          if (view) {
            dynamitesContainer.removeChild(view);
            view.destroy();
          }
          const sprite = new Sprite(dynamiteTexture);
          sprite.anchor.set(0.5);
          sprite.width = targetSize;
          sprite.height = targetSize;
          dynamitesContainer.addChild(sprite);
          view = sprite;
          dynamiteGraphicsMap.set(dynamite.id, view);
        } else {
          view.width = targetSize;
          view.height = targetSize;
          if (view.texture !== dynamiteTexture) {
            view.texture = dynamiteTexture;
          }
        }
      } else {
        if (!view || view instanceof Sprite) {
          if (view) {
            dynamitesContainer.removeChild(view);
            view.destroy();
          }
          const graphics = new Graphics();
          // Fallback matching the configured hotdog dimensions (32px x 10px in 64px tile space)
          const w = (dynamite.physicsConfig?.colliderWidth ?? 32) * (tileSize / 64) * dynamiteScale;
          const h = (dynamite.physicsConfig?.colliderHeight ?? 10) * (tileSize / 64) * dynamiteScale;
          graphics.roundRect(-w / 2, -h / 2, w, h, 2);
          graphics.fill(0xdc2626);
          graphics.rect(w / 2, -2 * dynamiteScale, 4 * dynamiteScale, 4 * dynamiteScale);
          graphics.fill(0xf59e0b);
          dynamitesContainer.addChild(graphics);
          view = graphics;
          dynamiteGraphicsMap.set(dynamite.id, view);
        }
      }

      // Position in world pixel coordinates
      view.x = dynamite.position.x * tileSize;
      view.y = dynamite.position.y * tileSize;
      if (typeof dynamite.angle === 'number') {
        view.rotation = dynamite.angle;
      }
    }

    // Clean up dynamites that exploded or were removed
    dynamiteGraphicsMap.forEach((view, id) => {
      if (!activeKeys.has(id)) {
        dynamitesContainer.removeChild(view);
        view.destroy();
        dynamiteGraphicsMap.delete(id);
      }
    });
  }

  /**
   * Render and update active flying projectiles (bullets) in world pixel coordinates.
   */
  public static updateActiveProjectiles(
    projectilesContainer: Container,
    activeProjectiles: MiningActiveProjectile[],
    projectileGraphicsMap: Map<string, Container>,
    tileSize: number = TILE_SIZE,
    bulletTexture?: Texture | null,
    defaultScale: number = 1.0
  ): void {
    const activeKeys = new Set<string>();

    for (const proj of activeProjectiles) {
      activeKeys.add(proj.id);
      let view = projectileGraphicsMap.get(proj.id);
      const projScale = typeof proj.inGameScale === 'number' && proj.inGameScale > 0
        ? proj.inGameScale
        : (defaultScale > 0 ? defaultScale : 1.0);

      if (!view) {
        const bulletCompound = new Container();

        // 1. Luminous golden tracer streak trailing behind bullet (high visibility)
        const tracer = new Graphics();
        // Warm outer streak
        tracer.roundRect(-42, -3.5, 46, 7, 3.5);
        tracer.fill({ color: 0xf59e0b, alpha: 0.85 });
        // Core incandescent white-gold streak
        tracer.roundRect(-30, -1.5, 34, 3, 1.5);
        tracer.fill({ color: 0xfffbeb, alpha: 0.95 });
        bulletCompound.addChild(tracer);

        // 2. Bullet head sprite or glowing capsule
        if (bulletTexture) {
          const sprite = new Sprite(bulletTexture);
          sprite.anchor.set(0.5);
          sprite.width = tileSize * 0.55;
          sprite.height = tileSize * 0.24;
          sprite.x = 4;
          bulletCompound.addChild(sprite);
        } else {
          const head = new Graphics();
          head.roundRect(-6, -3, 16, 6, 2.5);
          head.fill(0xf59e0b);
          head.rect(4, -2, 5, 4);
          head.fill(0xfef08a);
          bulletCompound.addChild(head);
        }

        bulletCompound.scale.set(projScale, projScale);
        projectilesContainer.addChild(bulletCompound);
        view = bulletCompound;
        projectileGraphicsMap.set(proj.id, view);
      } else {
        view.scale.set(projScale, projScale);
      }

      // Position in world pixel coordinates
      view.x = proj.position.x * tileSize;
      view.y = proj.position.y * tileSize;
      if (typeof proj.angle === 'number') {
        view.rotation = proj.angle;
      }
      if (typeof proj.alpha === 'number') {
        view.alpha = Math.max(0, Math.min(1, proj.alpha));
      } else {
        view.alpha = 1.0;
      }
    }

    // Clean up projectiles that hit or expired
    projectileGraphicsMap.forEach((view, id) => {
      if (!activeKeys.has(id)) {
        projectilesContainer.removeChild(view);
        view.destroy({ children: true });
        projectileGraphicsMap.delete(id);
      }
    });
  }
}
