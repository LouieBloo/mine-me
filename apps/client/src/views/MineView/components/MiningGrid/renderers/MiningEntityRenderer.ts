import { Assets, Graphics, Sprite, Texture, type Container } from 'pixi.js';
import { getAssetUrl, type MiningDroppedItem } from '@mine-me/shared';
import { TILE_SIZE } from './MiningTileRenderer';

export interface ActiveFallingRock {
  id: string;
  x: number;
  y: number;
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
              const texture = await Assets.load(getAssetUrl(item.iconUrl));
              const sprite = new Sprite(texture);
              sprite.anchor.set(0.5);
              sprite.x = itemX;
              sprite.y = itemY;
              sprite.width = tileSize * 0.6;
              sprite.height = tileSize * 0.6;
              droppedItemsContainer.addChild(sprite);
              droppedSpritesMap.set(key, sprite);
            } catch {
              const fallback = new Graphics();
              fallback.x = itemX;
              fallback.y = itemY;
              fallback.circle(0, 0, 10);
              fallback.fill(0xf59e0b);
              droppedItemsContainer.addChild(fallback);
              droppedSpritesMap.set(key, fallback);
            }
          };
          loadSprite();
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
          graphics.rect(0, 0, tileSize, tileSize);
          graphics.fill(0x334155);
          fallingRocksContainer.addChild(graphics);
          rockView = graphics;
          fallingRockGraphicsMap.set(rock.id, rockView);
        }
      }

      // rock.x and rock.y are CENTER coordinates (e.g. tileX+0.5, tileY+0.5)
      // Convert to top-left pixel coordinates to align with grid tile rendering
      rockView.x = (rock.x - 0.5) * tileSize;
      rockView.y = (rock.y - 0.5) * tileSize;
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
}
