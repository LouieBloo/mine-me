import { Assets, Graphics, Sprite, Texture, type Container } from 'pixi.js';
import { getAssetUrl, type MiningDroppedItem, type MiningActiveDynamite } from '@mine-me/shared';
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
      const key = `${item.itemId}_${item.position.x}_${item.position.y}_${idx}`;
      nextKeys.add(key);

      if (!droppedSpritesMap.has(key)) {
        const itemX = item.position.x * tileSize + tileSize / 2;
        const itemY = item.position.y * tileSize + tileSize / 2;

        if (item.iconUrl) {
          const loadSprite = async () => {
            try {
              const url = getAssetUrl(item.iconUrl);
              const texture = await Assets.load(url);
              const sprite = new Sprite(texture);
              sprite.anchor.set(0.5);
              sprite.width = tileSize * 0.6;
              sprite.height = tileSize * 0.6;
              sprite.x = itemX;
              sprite.y = itemY;
              droppedItemsContainer.addChild(sprite);
              droppedSpritesMap.set(key, sprite);
            } catch {
              const graphics = new Graphics();
              graphics.circle(0, 0, tileSize * 0.25);
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
          graphics.circle(0, 0, tileSize * 0.25);
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

      if (dynamiteTexture) {
        if (!view || !(view instanceof Sprite)) {
          if (view) {
            dynamitesContainer.removeChild(view);
            view.destroy();
          }
          const sprite = new Sprite(dynamiteTexture);
          sprite.anchor.set(0.5);
          // Scale sprite to match the 32px base item resolution (32 / 64 = 0.5 of a tile)
          sprite.width = tileSize * 0.5;
          sprite.height = tileSize * 0.5;
          dynamitesContainer.addChild(sprite);
          view = sprite;
          dynamiteGraphicsMap.set(dynamite.id, view);
        } else if (view.texture !== dynamiteTexture) {
          view.texture = dynamiteTexture;
        }
      } else {
        if (!view || view instanceof Sprite) {
          if (view) {
            dynamitesContainer.removeChild(view);
            view.destroy();
          }
          const graphics = new Graphics();
          // Fallback matching the configured hotdog dimensions (32px x 10px in 64px tile space)
          const w = (dynamite.physicsConfig?.colliderWidth ?? 32) * (tileSize / 64);
          const h = (dynamite.physicsConfig?.colliderHeight ?? 10) * (tileSize / 64);
          graphics.roundRect(-w / 2, -h / 2, w, h, 2);
          graphics.fill(0xdc2626);
          graphics.rect(w / 2, -2, 4, 4);
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
}
