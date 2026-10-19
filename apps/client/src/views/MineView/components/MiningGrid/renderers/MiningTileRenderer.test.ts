import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js';
import { MiningTileRenderer, TILE_CHUNK_CELLS } from './MiningTileRenderer';
import { MiningTileType, getTileFootprint, type MiningClientTile } from '@mine-me/shared';

describe('MiningTileRenderer', () => {
  let container: Container;

  beforeEach(() => {
    container = new Container();
  });

  it('draws damage cracks correctly based on damageStage', () => {
    const graphics = new Graphics();
    const moveToSpy = vi.spyOn(graphics, 'moveTo');
    const lineToSpy = vi.spyOn(graphics, 'lineTo');

    MiningTileRenderer.drawDamageCracks(graphics, 1, 64);
    expect(moveToSpy).toHaveBeenCalled();
    expect(lineToSpy).toHaveBeenCalled();

    moveToSpy.mockClear();
    lineToSpy.mockClear();

    MiningTileRenderer.drawDamageCracks(graphics, 4, 64);
    expect(moveToSpy).toHaveBeenCalled();
    expect(lineToSpy).toHaveBeenCalled();
  });

  it('draws fallback tile graphics for dirt, ladder and mineral', () => {
    const graphics = new Graphics();
    const rectSpy = vi.spyOn(graphics, 'rect');
    const fillSpy = vi.spyOn(graphics, 'fill');

    MiningTileRenderer.drawFallbackTile(graphics, MiningTileType.DIRT, 64);
    expect(rectSpy).toHaveBeenCalled();
    expect(fillSpy).toHaveBeenCalled();

    MiningTileRenderer.drawFallbackTile(graphics, MiningTileType.LADDER, 64);
    expect(rectSpy).toHaveBeenCalled();

    MiningTileRenderer.drawFallbackTile(graphics, MiningTileType.MINERAL, 64);
    expect(rectSpy).toHaveBeenCalled();

    MiningTileRenderer.drawFallbackTile(graphics, MiningTileType.TORCH, 64);
    expect(rectSpy).toHaveBeenCalled();
  });

  it('renders a grid of tiles into container and maintains graphics map', () => {
    const grid: MiningClientTile[][] = [
      [
        { type: MiningTileType.DIRT, revealed: true, damageStage: 0 },
        { type: MiningTileType.ROCK, revealed: false, damageStage: 0 },
      ],
      [
        { type: MiningTileType.LADDER, revealed: true, damageStage: 2 },
        { type: MiningTileType.EMPTY, revealed: true, damageStage: 0 },
      ],
    ];

    const blockTextures = new Map<number, Texture>();
    const tileGraphicsMap = new Map<string, Graphics>();
    const tileSpritesMap = new Map<string, Sprite>();

    MiningTileRenderer.renderGrid(container, grid, blockTextures, tileGraphicsMap, tileSpritesMap, 64);

    // A cell costs a display object only when it has something to show: fog and art-less blocks do, an empty cell does not
    expect(tileSpritesMap.has('1,0')).toBe(true); // fog
    expect(tileGraphicsMap.has('0,0')).toBe(true); // dirt without art
    expect(tileGraphicsMap.has('0,1')).toBe(true); // cracked ladder... drawn as fallback art
    expect(tileGraphicsMap.has('1,1')).toBe(false); // empty
    expect(tileSpritesMap.has('1,1')).toBe(false);
    expect(container.children.length).toBe(1); // all in one chunk
  });

  describe('pieces (ladders, torches, bridges)', () => {
    const footprint = getTileFootprint(MiningTileType.LADDER);
    const art = () => Texture.WHITE.frame && new Texture({ source: Texture.WHITE.source, frame: new Rectangle(0, 0, 30, 30) });

    it('cuts the art into one slice per cell, each a different part of the picture, cached', () => {
      const texture = art();
      const first = MiningTileRenderer.pieceSlice(texture, [0, 0], footprint);
      const last = MiningTileRenderer.pieceSlice(texture, [footprint.width - 1, footprint.height - 1], footprint);
      expect(first.frame.width).toBeCloseTo(30 / footprint.width);
      expect(first.frame.height).toBeCloseTo(30 / footprint.height);
      expect(first.frame.x).toBe(0);
      expect(last.frame.x).toBeCloseTo(30 - 30 / footprint.width);
      expect(last.frame.y).toBeCloseTo(30 - 30 / footprint.height);
      expect(MiningTileRenderer.pieceSlice(texture, [0, 0], footprint)).toBe(first);
    });

    it('shows a cell of a piece with its slice of the art, and a plain tile with the whole texture', () => {
      const texture = art();
      const textures = new Map<number, Texture>([[MiningTileType.LADDER, texture], [MiningTileType.DIRT, texture]]);
      const sprites = new Map<string, Sprite>();
      const graphics = new Map<string, Graphics>();
      const grid: MiningClientTile[][] = [[
        { type: MiningTileType.LADDER, revealed: true, piece: [1, 0] },
        { type: MiningTileType.DIRT, revealed: true },
      ]];
      MiningTileRenderer.renderGrid(container, grid, textures, graphics, sprites, 21);
      expect(sprites.get('0,0')!.texture).toBe(MiningTileRenderer.pieceSlice(texture, [1, 0], footprint));
      expect(sprites.get('1,0')!.texture).toBe(texture);
    });

    it('cuts a piece that records its own size by that size, so rocks of different sizes share one picture', () => {
      const texture = art();
      const wide = MiningTileRenderer.pieceSlice(texture, [2, 0, 3, 1], { width: 3, height: 1 });
      expect(wide.frame.width).toBeCloseTo(10);
      expect(wide.frame.height).toBeCloseTo(30);
      expect(wide.frame.x).toBeCloseTo(20);
      const square = MiningTileRenderer.pieceSlice(texture, [2, 0, 3, 3], { width: 3, height: 3 });
      expect(square.frame.height).toBeCloseTo(10);
      expect(square).not.toBe(wide);
    });

    it('shows a cell of a rock with the slice for the rock\'s own size', () => {
      const texture = art();
      const sprites = new Map<string, Sprite>();
      const grid: MiningClientTile[][] = [[
        { type: MiningTileType.ROCK, revealed: true, piece: [0, 0, 3, 1] },
        { type: MiningTileType.ROCK, revealed: true, piece: [1, 0, 3, 1] },
        { type: MiningTileType.ROCK, revealed: true },
      ]];
      MiningTileRenderer.renderGrid(container, grid, new Map([[MiningTileType.ROCK, texture]]), new Map(), sprites, 21);
      expect(sprites.get('1,0')!.texture.frame.width).toBeCloseTo(10);
      expect(sprites.get('2,0')!.texture).toBe(texture);
    });

    it('draws a rock with no art once, as a rectangle over its whole footprint', () => {
      const spy = vi.spyOn(MiningTileRenderer, 'drawFallbackTile');
      const grid: MiningClientTile[][] = [[
        { type: MiningTileType.ROCK, revealed: true, piece: [0, 0, 3, 2] },
        { type: MiningTileType.ROCK, revealed: true, piece: [1, 0, 3, 2] },
      ]];
      MiningTileRenderer.renderGrid(container, grid, new Map(), new Map(), new Map(), 21);
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith(expect.anything(), MiningTileType.ROCK, 63, 42);
      spy.mockRestore();
    });

    it('draws a piece with no art once, whole, from its top-left cell', () => {
      const spy = vi.spyOn(MiningTileRenderer, 'drawFallbackTile');
      const grid: MiningClientTile[][] = [[
        { type: MiningTileType.BRIDGE, revealed: true, piece: [0, 0] },
        { type: MiningTileType.BRIDGE, revealed: true, piece: [1, 0] },
      ]];
      MiningTileRenderer.renderGrid(container, grid, new Map(), new Map(), new Map(), 21);
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith(expect.anything(), MiningTileType.BRIDGE, 21 * footprint.width, 21 * footprint.height);
      spy.mockRestore();
    });
  });

  it('draws ladder with offsets and alpha', () => {
    const graphics = new Graphics();
    const rectSpy = vi.spyOn(graphics, 'rect');
    const fillSpy = vi.spyOn(graphics, 'fill');

    MiningTileRenderer.drawLadder(graphics, 64, 0.8, 10, 20);
    expect(rectSpy).toHaveBeenCalled();
    expect(fillSpy).toHaveBeenCalled();
  });

  it('draws a bridge from planks, or from its texture when it has one', () => {
    const g1 = new Graphics();
    const rect1 = vi.spyOn(g1, 'rect');
    MiningTileRenderer.drawBridge(g1, 64, 1, 0, 0);
    expect(rect1.mock.calls.length).toBeGreaterThan(1);

    const g2 = new Graphics();
    const rect2 = vi.spyOn(g2, 'rect');
    const fill2 = vi.spyOn(g2, 'fill');
    const texture = { width: 64, height: 64 } as any;
    MiningTileRenderer.drawBridge(g2, 64, 1, 0, 0, texture);
    expect(rect2).toHaveBeenCalledTimes(1);
    expect(fill2).toHaveBeenCalledWith({ texture, alpha: 1 });
  });

  it('does not render damage cracks for TORCH, LADDER, EMPTY, or ENTRANCE even if damageStage is > 0', () => {
    const drawCracksSpy = vi.spyOn(MiningTileRenderer, 'drawDamageCracks');

    const grid: MiningClientTile[][] = [
      [
        { type: MiningTileType.TORCH, revealed: true, damageStage: 3 },
        { type: MiningTileType.LADDER, revealed: true, damageStage: 2 },
      ],
      [
        { type: MiningTileType.EMPTY, revealed: true, damageStage: 1 },
        { type: MiningTileType.ENTRANCE, revealed: true, damageStage: 4 },
      ],
      [
        { type: MiningTileType.DIRT, revealed: true, damageStage: 2 },
      ],
    ];

    const blockTextures = new Map<number, Texture>();
    const tileGraphicsMap = new Map<string, Graphics>();
    const tileSpritesMap = new Map<string, Sprite>();

    MiningTileRenderer.renderGrid(container, grid, blockTextures, tileGraphicsMap, tileSpritesMap, 64);

    // Should only be called once for DIRT (row 2, col 0)
    expect(drawCracksSpy).toHaveBeenCalledTimes(1);
    expect(drawCracksSpy).toHaveBeenCalledWith(expect.anything(), 2, 64);

    drawCracksSpy.mockRestore();
  });

  it('incrementally updates only specified revealed tiles without full grid traversal', () => {
    const grid: MiningClientTile[][] = [
      [
        { type: MiningTileType.DIRT, revealed: false, damageStage: 0 },
        { type: MiningTileType.ROCK, revealed: false, damageStage: 0 },
      ],
      [
        { type: MiningTileType.LADDER, revealed: false, damageStage: 0 },
        { type: MiningTileType.EMPTY, revealed: false, damageStage: 0 },
      ],
    ];

    const blockTextures = new Map<number, Texture>();
    const tileGraphicsMap = new Map<string, Graphics>();
    const tileSpritesMap = new Map<string, Sprite>();

    // Initial render: all 4 are unrevealed
    MiningTileRenderer.renderGrid(container, grid, blockTextures, tileGraphicsMap, tileSpritesMap, 64);
    expect(tileSpritesMap.size).toBe(4); // fog is a sprite per cell
    expect(tileGraphicsMap.size).toBe(0);

    const renderSingleSpy = vi.spyOn(MiningTileRenderer, 'renderSingleTile');

    // Reveal only tile (1, 0)
    grid[0][1].revealed = true;
    MiningTileRenderer.updateRevealedTiles(
      container,
      [{ x: 1, y: 0, type: MiningTileType.ROCK }],
      grid,
      blockTextures,
      tileGraphicsMap,
      tileSpritesMap,
      64
    );

    expect(renderSingleSpy).toHaveBeenCalledTimes(1);
    expect(renderSingleSpy).toHaveBeenCalledWith(
      container,
      1,
      0,
      grid[0][1],
      blockTextures,
      tileGraphicsMap,
      tileSpritesMap,
      64
    );

    renderSingleSpy.mockRestore();
  });
});


describe('MiningTileRenderer chunks and cost', () => {
  const empty = (): MiningClientTile => ({ type: MiningTileType.EMPTY, revealed: true });

  it('puts cells in square chunks that the culler can skip whole, without visiting their cells', () => {
    const container = new Container();
    const grid: MiningClientTile[][] = Array.from({ length: 40 }, () => Array.from({ length: 40 }, () => ({ type: MiningTileType.DIRT, revealed: false })));
    MiningTileRenderer.renderGrid(container, grid, new Map(), new Map(), new Map(), 21);
    const chunksPerSide = Math.ceil(40 / TILE_CHUNK_CELLS);
    expect(container.children).toHaveLength(chunksPerSide * chunksPerSide);
    const chunk = container.children[0] as Container;
    expect(chunk.cullable).toBe(true);
    expect(chunk.cullableChildren).toBe(false);
    expect(chunk.cullArea).toMatchObject({ x: 0, y: 0, width: TILE_CHUNK_CELLS * 21, height: TILE_CHUNK_CELLS * 21 });
    expect(container.cullableChildren).toBe(true);
    // The same chunk is reused for every cell in it
    expect(MiningTileRenderer.chunkFor(container, 1, 1, 21)).toBe(chunk);
  });

  it('makes no display object for a revealed empty cell, and drops the graphics when cracks or fallback art go away', () => {
    const container = new Container();
    const sprites = new Map<string, Sprite>();
    const graphics = new Map<string, Graphics>();
    const tile: MiningClientTile = { type: MiningTileType.DIRT, revealed: true, damageStage: 2 };
    MiningTileRenderer.renderSingleTile(container, 3, 3, tile, new Map(), graphics, sprites, 21);
    expect(graphics.has('3,3')).toBe(true);
    const drawn = graphics.get('3,3')!;
    tile.type = MiningTileType.EMPTY;
    tile.damageStage = 0;
    MiningTileRenderer.renderSingleTile(container, 3, 3, tile, new Map(), graphics, sprites, 21);
    expect(graphics.has('3,3')).toBe(false);
    expect(drawn.destroyed).toBe(true);
    expect(sprites.size).toBe(0);
    MiningTileRenderer.renderSingleTile(container, 4, 3, empty(), new Map(), graphics, sprites, 21);
    expect(graphics.size + sprites.size).toBe(0);
  });

  it('fog is a black tinted sprite that turns into the block art when revealed, resized to the cell', () => {
    const container = new Container();
    const sprites = new Map<string, Sprite>();
    const art = new Texture({ source: Texture.WHITE.source, frame: new Rectangle(0, 0, 64, 64) });
    const tile: MiningClientTile = { type: MiningTileType.DIRT, revealed: false };
    MiningTileRenderer.renderSingleTile(container, 2, 2, tile, new Map([[MiningTileType.DIRT, art]]), new Map(), sprites, 21);
    expect(sprites.get('2,2')!.tint).toBe(0x000000);
    tile.revealed = true;
    MiningTileRenderer.renderSingleTile(container, 2, 2, tile, new Map([[MiningTileType.DIRT, art]]), new Map(), sprites, 21);
    const sprite = sprites.get('2,2')!;
    expect(sprite.texture).toBe(art);
    expect(sprite.tint).toBe(0xffffff);
    expect(sprite.width).toBe(21);
    expect(sprite.height).toBe(21);
  });
});
