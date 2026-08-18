import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { MiningTileRenderer } from './MiningTileRenderer';
import { MiningTileType, type MiningClientTile } from '@mine-me/shared';

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

    expect(tileGraphicsMap.size).toBe(4);
    expect(tileGraphicsMap.has('0,0')).toBe(true);
    expect(tileGraphicsMap.has('1,0')).toBe(true);
    expect(tileGraphicsMap.has('0,1')).toBe(true);
    expect(tileGraphicsMap.has('1,1')).toBe(true);
    expect(container.children.length).toBe(4);
  });
});
