import { Graphics, Sprite, Texture, type Container } from 'pixi.js';
import { MiningTileType, type MiningClientTile } from '@mine-me/shared';

export const TILE_SIZE = 64;

export class MiningTileRenderer {
  public static drawDamageCracks(graphics: Graphics, damageStage: number, tileSize: number = TILE_SIZE): void {
    const c = tileSize / 2;
    const darkColor = 0x000000;

    if (damageStage >= 1) {
      graphics.moveTo(c - 8, c - 10);
      graphics.lineTo(c + 2, c);
      graphics.lineTo(c - 4, c + 10);
      graphics.stroke({ width: 1.5, color: darkColor, alpha: 0.8 });
    }
    if (damageStage >= 2) {
      graphics.moveTo(c + 10, c - 12);
      graphics.lineTo(c - 2, c);
      graphics.lineTo(c + 12, c + 8);
      graphics.stroke({ width: 2, color: darkColor, alpha: 0.85 });
    }
    if (damageStage >= 3) {
      graphics.moveTo(c - 12, c - 4);
      graphics.lineTo(c + 12, c - 2);
      graphics.moveTo(c - 6, c + 12);
      graphics.lineTo(c + 8, c - 14);
      graphics.stroke({ width: 2.5, color: darkColor, alpha: 0.9 });
    }
    if (damageStage >= 4) {
      graphics.rect(4, 4, tileSize - 8, tileSize - 8);
      graphics.stroke({ width: 3, color: darkColor, alpha: 0.95 });
      graphics.moveTo(c - 14, c + 6);
      graphics.lineTo(c + 14, c - 8);
      graphics.stroke({ width: 3, color: darkColor, alpha: 1.0 });
    }
  }

  public static drawFallbackTile(graphics: Graphics, type: MiningTileType, tileSize: number = TILE_SIZE): void {
    switch (type) {
      case MiningTileType.EMPTY:
        // Empty space shows background
        break;
      case MiningTileType.DIRT:
        graphics.rect(0, 0, tileSize, tileSize);
        graphics.fill(0x451a03);
        graphics.circle(16, 20, 2);
        graphics.circle(48, 12, 1.5);
        graphics.circle(32, 44, 2);
        graphics.fill(0x78350f);
        break;
      case MiningTileType.ROCK:
        graphics.rect(0, 0, tileSize, tileSize);
        graphics.fill(0x334155);
        break;
      case MiningTileType.MINERAL:
        graphics.rect(0, 0, tileSize, tileSize);
        graphics.fill(0x312e81);
        graphics.circle(20, 20, 3);
        graphics.circle(44, 24, 4);
        graphics.fill(0xf59e0b);
        break;
      case MiningTileType.CHEST:
        graphics.rect(4, 4, tileSize - 8, tileSize - 8);
        graphics.fill(0xd97706);
        break;
      case MiningTileType.ENTRANCE:
        graphics.rect(0, 0, tileSize, tileSize);
        graphics.fill(0x064e3b);
        break;
      case MiningTileType.LADDER:
        // Wooden side rails
        graphics.rect(14, 0, 6, tileSize);
        graphics.rect(tileSize - 20, 0, 6, tileSize);
        graphics.fill(0x78350f);
        // Wooden rungs
        for (let ry = 8; ry < tileSize; ry += 14) {
          graphics.rect(14, ry, tileSize - 28, 4);
        }
        graphics.fill(0xb45309);
        break;
    }
  }

  public static renderGrid(
    tilesContainer: Container,
    grid: MiningClientTile[][],
    blockTextures: Map<number, Texture>,
    tileGraphicsMap: Map<string, Graphics>,
    tileSpritesMap: Map<string, Sprite>,
    tileSize: number = TILE_SIZE
  ): void {
    grid.forEach((row, y) => {
      row.forEach((tile, x) => {
        const key = `${x},${y}`;
        let graphics = tileGraphicsMap.get(key);

        if (!graphics) {
          graphics = new Graphics();
          graphics.x = x * tileSize;
          graphics.y = y * tileSize;
          tilesContainer.addChild(graphics);
          tileGraphicsMap.set(key, graphics);
        }

        const blockTexture = tile.revealed ? blockTextures.get(tile.type) : undefined;
        let tileSprite = tileSpritesMap.get(key);

        if (tile.revealed && blockTexture) {
          if (!tileSprite) {
            tileSprite = new Sprite(blockTexture);
            tileSprite.x = x * tileSize;
            tileSprite.y = y * tileSize;
            tileSprite.width = tileSize;
            tileSprite.height = tileSize;
            // Add below graphics overlay (cracks)
            tilesContainer.addChildAt(tileSprite, Math.max(0, tilesContainer.getChildIndex(graphics)));
            tileSpritesMap.set(key, tileSprite);
          } else {
            tileSprite.texture = blockTexture;
            tileSprite.visible = true;
          }
        } else if (tileSprite) {
          tileSprite.visible = false;
        }

        graphics.clear();
        if (!tile.revealed) {
          graphics.rect(0, 0, tileSize, tileSize);
          graphics.fill(0x000000);
        } else {
          if (!blockTexture) {
            this.drawFallbackTile(graphics, tile.type, tileSize);
          }

          // Render crack overlay if block is partially mined (exclude non-mineable tiles: EMPTY, ENTRANCE, LADDER)
          if (
            tile.damageStage &&
            tile.damageStage > 0 &&
            tile.type !== MiningTileType.EMPTY &&
            tile.type !== MiningTileType.ENTRANCE &&
            tile.type !== MiningTileType.LADDER
          ) {
            this.drawDamageCracks(graphics, tile.damageStage, tileSize);
          }
        }
      });
    });
  }
}
