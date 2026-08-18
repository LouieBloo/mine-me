import { Assets, Graphics, Sprite, type Container } from 'pixi.js';
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
    fallingRockGraphicsMap: Map<string, Graphics>,
    tileSize: number = TILE_SIZE
  ): void {
    const activeRockKeys = new Set<string>();

    for (const rock of fallingRocks) {
      activeRockKeys.add(rock.id);
      let rockGraphics = fallingRockGraphicsMap.get(rock.id);
      if (!rockGraphics) {
        rockGraphics = new Graphics();
        rockGraphics.rect(0, 0, tileSize, tileSize);
        rockGraphics.fill(0x334155);
        fallingRocksContainer.addChild(rockGraphics);
        fallingRockGraphicsMap.set(rock.id, rockGraphics);
      }
      // rock.x and rock.y are CENTER coordinates (e.g. tileX+0.5, tileY+0.5)
      // Convert to top-left pixel coordinates to align with grid tile rendering
      rockGraphics.x = (rock.x - 0.5) * tileSize;
      rockGraphics.y = (rock.y - 0.5) * tileSize;
    }

    // Clean up graphics for rocks that have settled back into grid
    fallingRockGraphicsMap.forEach((graphics, id) => {
      if (!activeRockKeys.has(id)) {
        fallingRocksContainer.removeChild(graphics);
        graphics.destroy();
        fallingRockGraphicsMap.delete(id);
      }
    });
  }
}
