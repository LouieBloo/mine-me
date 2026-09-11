import { Graphics, Sprite, Texture, type Container } from 'pixi.js';
import { MiningTileType, canTileBeDamaged, type MiningClientTile } from '@mine-me/shared';

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
        MiningTileRenderer.drawLadder(graphics, tileSize);
        break;
      case MiningTileType.TORCH:
        MiningTileRenderer.drawTorch(graphics, tileSize);
        break;
    }
  }

  public static drawLadder(
    graphics: Graphics,
    tileSize: number = TILE_SIZE,
    alpha: number = 1.0,
    offsetX: number = 0,
    offsetY: number = 0,
    texture?: Texture
  ): void {
    if (texture) {
      graphics.rect(offsetX, offsetY, tileSize, tileSize);
      graphics.fill({ texture, alpha });
      return;
    }

    // Wooden side rails
    graphics.rect(offsetX + 14, offsetY + 0, 6, tileSize);
    graphics.rect(offsetX + tileSize - 20, offsetY + 0, 6, tileSize);
    graphics.fill({ color: 0x78350f, alpha });
    // Wooden rungs
    for (let ry = 8; ry < tileSize; ry += 14) {
      graphics.rect(offsetX + 14, offsetY + ry, tileSize - 28, 4);
    }
    graphics.fill({ color: 0xb45309, alpha });
  }

  public static drawTorch(
    graphics: Graphics,
    tileSize: number = TILE_SIZE,
    alpha: number = 1.0,
    offsetX: number = 0,
    offsetY: number = 0,
    texture?: Texture
  ): void {
    if (texture) {
      graphics.rect(offsetX, offsetY, tileSize, tileSize);
      graphics.fill({ texture, alpha });
      return;
    }

    const cx = offsetX + tileSize / 2;
    const cy = offsetY + tileSize * 0.75; // Sits 3/4 up the tile

    // 1. Wall Mount Bracket (Dark Iron fixture)
    graphics.rect(cx - 5, cy + 6, 10, 4);
    graphics.rect(cx - 2, cy + 10, 4, 4);
    graphics.fill({ color: 0x1e293b, alpha });

    // 2. Wooden Torch Shaft (angled wooden post)
    graphics.moveTo(cx - 3, cy + 6);
    graphics.lineTo(cx + 3, cy + 6);
    graphics.lineTo(cx + 4, cy - 14);
    graphics.lineTo(cx - 4, cy - 14);
    graphics.closePath();
    graphics.fill({ color: 0x78350f, alpha });

    // Wooden shaft highlight
    graphics.rect(cx - 1, cy - 12, 2, 16);
    graphics.fill({ color: 0x92400e, alpha });

    // 3. Metal Head Band / Sconce
    graphics.rect(cx - 5, cy - 16, 10, 4);
    graphics.fill({ color: 0x475569, alpha });

    // 4. Outer Flame / Glow (Vibrant Orange)
    graphics.ellipse(cx, cy - 22, 6, 9);
    graphics.fill({ color: 0xf97316, alpha: alpha * 0.9 });

    // 5. Inner Hot Core Flame (Bright Golden Yellow)
    graphics.ellipse(cx, cy - 21, 3.5, 5.5);
    graphics.fill({ color: 0xfef08a, alpha: alpha * 0.95 });

    // 6. Floating micro-ember spark
    graphics.circle(cx + 1, cy - 31, 1.2);
    graphics.fill({ color: 0xfbbf24, alpha: alpha * 0.8 });
  }

  public static renderSingleTile(
    tilesContainer: Container,
    x: number,
    y: number,
    tile: MiningClientTile,
    blockTextures: Map<number, Texture>,
    tileGraphicsMap: Map<string, Graphics>,
    tileSpritesMap: Map<string, Sprite>,
    tileSize: number = TILE_SIZE
  ): void {
    const key = `${x},${y}`;
    let graphics = tileGraphicsMap.get(key);

    if (!graphics) {
      graphics = new Graphics();
      graphics.x = x * tileSize;
      graphics.y = y * tileSize;
      graphics.cullable = true;
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
        tileSprite.cullable = true;
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

      // Render crack overlay if block is partially mined and tile can be damaged
      if (tile.damageStage && tile.damageStage > 0 && canTileBeDamaged(tile.type)) {
        this.drawDamageCracks(graphics, tile.damageStage, tileSize);
      }
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
    tilesContainer.cullableChildren = true;
    grid.forEach((row, y) => {
      row.forEach((tile, x) => {
        this.renderSingleTile(
          tilesContainer,
          x,
          y,
          tile,
          blockTextures,
          tileGraphicsMap,
          tileSpritesMap,
          tileSize
        );
      });
    });
  }

  public static updateRevealedTiles(
    tilesContainer: Container,
    revealedTiles: { x: number; y: number; type: number; damageStage?: number }[],
    grid: MiningClientTile[][],
    blockTextures: Map<number, Texture>,
    tileGraphicsMap: Map<string, Graphics>,
    tileSpritesMap: Map<string, Sprite>,
    tileSize: number = TILE_SIZE
  ): void {
    for (const rt of revealedTiles) {
      const tile = grid[rt.y]?.[rt.x];
      if (tile) {
        this.renderSingleTile(
          tilesContainer,
          rt.x,
          rt.y,
          tile,
          blockTextures,
          tileGraphicsMap,
          tileSpritesMap,
          tileSize
        );
      }
    }
  }
}
