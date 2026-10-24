import { Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js';
import {
  MINING_TILE_PIXELS,
  MiningTileType,
  autotileMask,
  isAutotileTerrain,
  canTileBeDamaged,
  pieceFootprint,
  type MiningClientTile,
  type PieceOffset,
} from '@mine-me/shared';
import { autotileVariants } from './AutotileVariants';

/** One block on screen, in pixels (shared with the server's pixel-sized colliders and the admin previews). */
export const TILE_SIZE = MINING_TILE_PIXELS;

/** The slices of a piece's art, so each cell of a ladder, torch or bridge shows its own part of the one picture. */
const pieceSlices = new WeakMap<Texture, Map<string, Texture>>();

/** Cells along one side of a chunk of tiles (see MiningTileRenderer.chunkFor). */
export const TILE_CHUNK_CELLS = 16;
/** The cell itself and the four around it: everything a change can alter the edge picture of. */
const NEIGHBOUR_REDRAW: ReadonlyArray<readonly [number, number]> = [[0, 0], [0, -1], [1, 0], [0, 1], [-1, 0]];
const tileChunks = new WeakMap<Container, Map<string, Container>>();

/** The stand-in colours of the basic terrain blocks (ticket 140), used only while a block has no texture. */
const BASIC_TERRAIN_LOOKS: Record<number, { base: number; fleck: number }> = {
  [MiningTileType.STONE]: { base: 0x57534e, fleck: 0x78716c },
  [MiningTileType.CLAY]: { base: 0x9a5b3c, fleck: 0xb87350 },
  [MiningTileType.SANDSTONE]: { base: 0xc2a26a, fleck: 0xdcc28d },
  [MiningTileType.GRAVEL]: { base: 0x6b6b6b, fleck: 0x9a9a9a },
  [MiningTileType.ICE]: { base: 0x9ed8ee, fleck: 0xe0f6ff },
  [MiningTileType.BEDROCK]: { base: 0x1c1c22, fleck: 0x34343e },
};

export class MiningTileRenderer {
  /**
   * The part of a piece's `texture` that the cell at `offset` shows: the picture is cut into a grid of
   * footprint-width by footprint-height parts. Cached, since every cell asks every time it is redrawn.
   */
  public static pieceSlice(texture: Texture, offset: PieceOffset, footprint: { width: number; height: number }): Texture {
    let slices = pieceSlices.get(texture);
    if (!slices) {
      slices = new Map();
      pieceSlices.set(texture, slices);
    }
    const key = `${offset[0]},${offset[1]},${footprint.width}x${footprint.height}`;
    let slice = slices.get(key);
    if (!slice) {
      const frame = texture.frame;
      const w = frame.width / footprint.width;
      const h = frame.height / footprint.height;
      slice = new Texture({ source: texture.source, frame: new Rectangle(frame.x + offset[0] * w, frame.y + offset[1] * h, w, h) });
      slices.set(key, slice);
    }
    return slice;
  }

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

  public static drawFallbackTile(graphics: Graphics, type: MiningTileType, tileSize: number = TILE_SIZE, tileHeight: number = tileSize): void {
    switch (type) {
      case MiningTileType.EMPTY:
        // Empty space shows background
        break;
      case MiningTileType.DIRT:
        graphics.rect(0, 0, tileSize, tileHeight);
        graphics.fill(0x451a03);
        graphics.circle(16, 20, 2);
        graphics.circle(48, 12, 1.5);
        graphics.circle(32, 44, 2);
        graphics.fill(0x78350f);
        break;
      case MiningTileType.ROCK:
        graphics.rect(0, 0, tileSize, tileHeight);
        graphics.fill(0x334155);
        break;
      case MiningTileType.LADDER:
        MiningTileRenderer.drawLadder(graphics, tileSize);
        break;
      case MiningTileType.TORCH:
        MiningTileRenderer.drawTorch(graphics, tileSize);
        break;
      case MiningTileType.BRIDGE:
        MiningTileRenderer.drawBridge(graphics, tileSize);
        break;
      case MiningTileType.LAVAROCK:
        // Cooled lava: near-black basalt with dull orange cracks (stands in until a texture is uploaded)
        graphics.rect(0, 0, tileSize, tileHeight);
        graphics.fill(0x1c1917);
        graphics.moveTo(6, 18);
        graphics.lineTo(24, 28);
        graphics.lineTo(34, 22);
        graphics.lineTo(58, 40);
        graphics.stroke({ width: 1.5, color: 0xc2410c, alpha: 0.8 });
        break;
      case MiningTileType.STONE:
      case MiningTileType.CLAY:
      case MiningTileType.SANDSTONE:
      case MiningTileType.GRAVEL:
      case MiningTileType.ICE:
      case MiningTileType.BEDROCK: {
        // Basic terrain: a flat colour with a few flecks until the block has a texture in the admin
        const look = BASIC_TERRAIN_LOOKS[type];
        graphics.rect(0, 0, tileSize, tileHeight);
        graphics.fill(look.base);
        graphics.circle(16, 20, 2);
        graphics.circle(46, 14, 1.5);
        graphics.circle(30, 46, 2);
        graphics.fill(look.fleck);
        break;
      }
      case MiningTileType.COPPERIUM:
        // Dark shale with warm copper nuggets and cyan energy flecks
        graphics.rect(0, 0, tileSize, tileHeight);
        graphics.fill(0x1e1b18);
        graphics.circle(20, 22, 5);
        graphics.circle(42, 38, 6);
        graphics.circle(36, 18, 4);
        graphics.fill(0xb45309);
        graphics.circle(22, 24, 2);
        graphics.circle(44, 40, 2.5);
        graphics.fill(0xf59e0b);
        // Cyan energy fissure
        graphics.moveTo(10, 48);
        graphics.lineTo(26, 32);
        graphics.lineTo(38, 36);
        graphics.lineTo(54, 14);
        graphics.stroke({ width: 1.5, color: 0x38bdf8, alpha: 0.9 });
        break;
      case MiningTileType.SILVERIUM:
        // Deep granite with lustrous silver facets and cyan energy fissures
        graphics.rect(0, 0, tileSize, tileHeight);
        graphics.fill(0x0f172a);
        graphics.circle(18, 20, 5);
        graphics.circle(44, 26, 6);
        graphics.circle(30, 44, 4.5);
        graphics.fill(0x94a3b8);
        graphics.circle(19, 21, 2.5);
        graphics.circle(45, 27, 3);
        graphics.fill(0xe2e8f0);
        // Cyan energy fissure
        graphics.moveTo(14, 12);
        graphics.lineTo(28, 30);
        graphics.lineTo(40, 28);
        graphics.lineTo(52, 50);
        graphics.stroke({ width: 1.5, color: 0x06b6d4, alpha: 0.95 });
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

  /** A bridge: wooden planks across the tile. Used until the bridge has a texture set on its block in the admin. */
  public static drawBridge(
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

    // Planks along the top of the tile, with a darker beam underneath
    graphics.rect(offsetX, offsetY, tileSize, tileSize * 0.3);
    graphics.fill({ color: 0xb45309, alpha });
    graphics.rect(offsetX, offsetY + tileSize * 0.3, tileSize, tileSize * 0.12);
    graphics.fill({ color: 0x78350f, alpha });
    for (let px = tileSize / 4; px < tileSize; px += tileSize / 4) {
      graphics.rect(offsetX + px - 1, offsetY, 2, tileSize * 0.3);
    }
    graphics.fill({ color: 0x78350f, alpha: alpha * 0.8 });
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

  /**
   * The container that holds the cells around (x, y). Tiles live in square chunks rather than all in one
   * container, so the culler can skip every chunk that is off screen with one check instead of visiting each of
   * the tens of thousands of cells, and Pixi never has to draw or even walk them.
   */
  public static chunkFor(tilesContainer: Container, x: number, y: number, tileSize: number): Container {
    let chunks = tileChunks.get(tilesContainer);
    if (!chunks) {
      chunks = new Map();
      tileChunks.set(tilesContainer, chunks);
      tilesContainer.cullableChildren = true;
    }
    const cx = Math.floor(x / TILE_CHUNK_CELLS);
    const cy = Math.floor(y / TILE_CHUNK_CELLS);
    const key = `${cx},${cy}`;
    let chunk = chunks.get(key);
    if (!chunk) {
      chunk = new Container();
      chunk.cullable = true;
      chunk.cullableChildren = false; // the chunk is culled as a whole; its cells are never visited
      const size = TILE_CHUNK_CELLS * tileSize;
      chunk.cullArea = new Rectangle(cx * size, cy * size, size, size);
      tilesContainer.addChild(chunk);
      chunks.set(key, chunk);
    }
    return chunk;
  }

  /**
   * Draws one cell. A cell costs a display object only when it has something to show: a sprite for a textured
   * block or for fog (a tinted white square, so fog batches with the blocks), and a Graphics only for
   * what a sprite cannot do (art-less fallback blocks and crack overlays). Empty revealed cells cost nothing.
   */
  public static renderSingleTile(
    tilesContainer: Container,
    x: number,
    y: number,
    tile: MiningClientTile,
    blockTextures: Map<number, Texture>,
    tileGraphicsMap: Map<string, Graphics>,
    tileSpritesMap: Map<string, Sprite>,
    tileSize: number = TILE_SIZE,
    grid?: MiningClientTile[][]
  ): void {
    const key = `${x},${y}`;
    const chunk = this.chunkFor(tilesContainer, x, y, tileSize);
    let graphics = tileGraphicsMap.get(key);
    let tileSprite = tileSpritesMap.get(key);

    const footprint = pieceFootprint(tile.type, tile.piece);
    const wholeTexture = tile.revealed ? blockTextures.get(tile.type) : undefined;
    // A cell of a piece shows its slice of the piece's art
    let blockTexture = wholeTexture && tile.piece ? this.pieceSlice(wholeTexture, tile.piece, footprint) : wholeTexture;
    // Terrain takes the picture for the sides that face open space (ticket 094); it needs the grid to know them
    if (blockTexture && grid && isAutotileTerrain(tile)) {
      blockTexture = autotileVariants.textureFor(tile.type, blockTexture, autotileMask(grid, x, y));
    }

    // 1. The sprite: fog, or the block's art
    const spriteTexture = !tile.revealed ? Texture.WHITE : blockTexture;
    if (spriteTexture) {
      if (!tileSprite) {
        tileSprite = new Sprite(spriteTexture);
        tileSprite.x = x * tileSize;
        tileSprite.y = y * tileSize;
        // Under the cell's graphics (cracks) when it already has some
        if (graphics && graphics.parent === chunk) chunk.addChildAt(tileSprite, chunk.getChildIndex(graphics));
        else chunk.addChild(tileSprite);
        tileSpritesMap.set(key, tileSprite);
      } else {
        tileSprite.texture = spriteTexture;
        tileSprite.visible = true;
      }
      // Set after the texture, since the size is relative to the texture it has
      tileSprite.width = tileSize;
      tileSprite.height = tileSize;
      tileSprite.tint = tile.revealed ? 0xffffff : 0x000000;
    } else if (tileSprite) {
      tileSprite.visible = false;
    }

    // 2. The graphics: only what a sprite cannot show
    const needsFallback = tile.revealed && !blockTexture && tile.type !== MiningTileType.EMPTY;
    const needsCracks = tile.revealed && Boolean(tile.damageStage && tile.damageStage > 0 && canTileBeDamaged(tile.type));
    if (!needsFallback && !needsCracks) {
      if (graphics) {
        graphics.destroy();
        tileGraphicsMap.delete(key);
      }
      return;
    }

    if (!graphics) {
      graphics = new Graphics();
      graphics.x = x * tileSize;
      graphics.y = y * tileSize;
      chunk.addChild(graphics);
      tileGraphicsMap.set(key, graphics);
    }
    graphics.clear();
    if (needsFallback) {
      // A piece with no art is drawn whole by its top-left cell; the other cells have nothing to add
      if (!tile.piece) this.drawFallbackTile(graphics, tile.type, tileSize);
      else if (tile.piece[0] === 0 && tile.piece[1] === 0) this.drawFallbackTile(graphics, tile.type, tileSize * footprint.width, tileSize * footprint.height);
    }
    // Render crack overlay if block is partially mined and tile can be damaged
    if (needsCracks) this.drawDamageCracks(graphics, tile.damageStage as number, tileSize);
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
          tileSize,
          grid
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
    // A changed cell also changes the edges of the four cells around it (a mined block exposes its neighbours, a
    // revealed cell stops being fog), so those redraw too, each once
    const cells = new Map<string, { x: number; y: number }>();
    for (const rt of revealedTiles) {
      for (const [dx, dy] of NEIGHBOUR_REDRAW) {
        const x = rt.x + dx;
        const y = rt.y + dy;
        if (grid[y]?.[x]) cells.set(`${x},${y}`, { x, y });
      }
    }
    for (const { x, y } of cells.values()) {
      this.renderSingleTile(tilesContainer, x, y, grid[y][x], blockTextures, tileGraphicsMap, tileSpritesMap, tileSize, grid);
    }
  }
}
