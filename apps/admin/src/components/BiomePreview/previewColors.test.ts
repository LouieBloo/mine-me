import { describe, it, expect, vi } from 'vitest';
import { MiningTileType } from '@mine-me/shared';
import { biomeColor, biomeShares, drawBiomePreview, tileColor, type BiomePreviewResult } from './previewColors';

const result: BiomePreviewResult = {
  width: 2,
  height: 2,
  biomes: [
    { index: 0, key: 'default', name: 'Default', ambient: {} },
    { index: 1, key: 'frozen', name: 'Frozen', ambient: { tint: '#99bbff' } },
  ],
  tiles: [MiningTileType.DIRT, MiningTileType.ROCK, MiningTileType.EMPTY, MiningTileType.SILVERIUM],
  biomeIndex: [0, 0, 1, 1],
  fluidCells: [{ x: 0, y: 1, typeKey: 'OIL' }],
  gasCells: [{ x: 1, y: 1, typeKey: 'HYDROGEN' }],
};

const fakeContext = () => {
  const fills: { style: unknown; args: number[] }[] = [];
  const ctx: any = {
    fillStyle: '',
    globalAlpha: 1,
    clearRect: vi.fn(),
    fillRect: vi.fn((...args: number[]) => fills.push({ style: ctx.fillStyle, args })),
  };
  return { ctx: ctx as CanvasRenderingContext2D, fills };
};

describe('basic terrain colours', () => {
  it('every block type has its own swatch, not the fallback', () => {
    for (const type of [MiningTileType.STONE, MiningTileType.CLAY, MiningTileType.SANDSTONE, MiningTileType.GRAVEL, MiningTileType.ICE, MiningTileType.BEDROCK]) {
      expect(tileColor(type)).not.toBe('#ff00ff');
    }
  });
});

describe('previewColors', () => {
  it('gives each block its own swatch, and a loud one for a block it does not know', () => {
    expect(tileColor(MiningTileType.DIRT)).not.toBe(tileColor(MiningTileType.ROCK));
    expect(tileColor(9999)).toBe('#ff00ff');
  });

  it('marks a biome with its tint, or a hue by position when it has none', () => {
    expect(biomeColor(1, { tint: '#99bbff' })).toBe('#99bbff');
    expect(biomeColor(0)).toMatch(/^hsl\(/);
    expect(biomeColor(0)).not.toBe(biomeColor(1));
    expect(biomeColor(1, { tint: 'blue' })).toMatch(/^hsl\(/);
  });

  it('adds up how much of the strip each biome covers', () => {
    expect(biomeShares(result)).toEqual([
      { key: 'default', name: 'Default', share: 0.5 },
      { key: 'frozen', name: 'Frozen', share: 0.5 },
    ]);
  });

  it('draws the regions alone in regions mode', () => {
    const { ctx, fills } = fakeContext();
    drawBiomePreview(ctx, result, 'biomes', 4);
    expect(fills).toHaveLength(4);
    expect(fills[2].style).toBe('#99bbff');
    expect(fills[2].args).toEqual([0, 4, 4, 4]);
  });

  it('draws the blocks with a wash of the biome colour, then fluid and gas, in blocks mode', () => {
    const { ctx, fills } = fakeContext();
    drawBiomePreview(ctx, result, 'blocks', 4);
    // 4 cells x (block + wash) + 1 fluid + 1 gas
    expect(fills).toHaveLength(10);
    expect(fills[0].style).toBe(tileColor(MiningTileType.DIRT));
    expect(fills[8].args).toEqual([0, 4, 4, 4]);
    expect(fills[9].args).toEqual([4, 4, 4, 4]);
  });
});
