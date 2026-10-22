import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Texture } from 'pixi.js';
import { AUTOTILE_LEFT, AUTOTILE_TOP, DEFAULT_AUTOTILE_STYLE } from '@mine-me/shared';
import { AutotileVariants, type AutotileCanvasFactory } from './AutotileVariants';

describe('AutotileVariants', () => {
  const DIRT = 1;
  const STONE = 2;
  let drawn: number;
  let factory: AutotileCanvasFactory;
  let base: Texture;

  /** A recording stand-in for a canvas, and a texture per canvas, so what is built can be counted. */
  beforeEach(() => {
    drawn = 0;
    factory = {
      createCanvas: vi.fn(() => {
        drawn++;
        const ctx: any = new Proxy({}, { get: (_t, prop) => (prop === 'createLinearGradient' ? () => ({ addColorStop() {} }) : () => undefined), set: () => true });
        return { canvas: {} as HTMLCanvasElement, ctx };
      }),
      toTexture: vi.fn(() => new Texture()),
    };
    base = new Texture();
    // A texture that has an image to draw from
    Object.defineProperty(base, 'source', { value: { resource: {} }, configurable: true });
    Object.defineProperty(base, 'frame', { value: { x: 0, y: 0, width: 64, height: 64 }, configurable: true });
  });

  it('returns the plain texture for a cell with no exposed side', () => {
    const variants = new AutotileVariants(factory);
    expect(variants.textureFor(DIRT, base, 0)).toBe(base);
    expect(drawn).toBe(0);
  });

  it('builds a variant once per mask and keeps it', () => {
    const variants = new AutotileVariants(factory);
    const top = variants.textureFor(DIRT, base, AUTOTILE_TOP);
    expect(top).not.toBe(base);
    expect(variants.textureFor(DIRT, base, AUTOTILE_TOP)).toBe(top);
    expect(drawn).toBe(1);
    expect(variants.textureFor(DIRT, base, AUTOTILE_LEFT)).not.toBe(top);
    expect(drawn).toBe(2);
  });

  it('shares a variant between block types that use the same texture and look', () => {
    const variants = new AutotileVariants(factory);
    expect(variants.textureFor(DIRT, base, AUTOTILE_TOP)).toBe(variants.textureFor(STONE, base, AUTOTILE_TOP));
    expect(drawn).toBe(1);
  });

  it('draws a block with its own override differently from the map default', () => {
    const variants = new AutotileVariants(factory);
    variants.configure({ radius: 0.1 }, new Map([[STONE, { radius: 0.4 }]]));
    expect(variants.styleFor(DIRT).radius).toBe(0.1);
    expect(variants.styleFor(STONE).radius).toBe(0.4);
    expect(variants.styleFor(STONE).rimWidth).toBe(DEFAULT_AUTOTILE_STYLE.rimWidth);
    expect(variants.textureFor(DIRT, base, AUTOTILE_TOP)).not.toBe(variants.textureFor(STONE, base, AUTOTILE_TOP));
    expect(drawn).toBe(2);
  });

  it('forgets variants when the look is configured again', () => {
    const variants = new AutotileVariants(factory);
    const before = variants.textureFor(DIRT, base, AUTOTILE_TOP);
    variants.configure({ radius: 0.1 });
    expect(variants.textureFor(DIRT, base, AUTOTILE_TOP)).not.toBe(before);
    expect(drawn).toBe(2);
  });

  it('draws the plain texture for a block whose look does nothing', () => {
    const variants = new AutotileVariants(factory);
    variants.configure({ radius: 0, rimStrength: 0 });
    expect(variants.textureFor(DIRT, base, AUTOTILE_TOP)).toBe(base);
    expect(drawn).toBe(0);
  });

  it('falls back to the plain texture when there is no canvas or no image to draw from', () => {
    const noCanvas = new AutotileVariants({ ...factory, createCanvas: () => null });
    expect(noCanvas.textureFor(DIRT, base, AUTOTILE_TOP)).toBe(base);
    const noImage = new AutotileVariants(factory);
    const blank = new Texture();
    Object.defineProperty(blank, 'source', { value: { resource: undefined }, configurable: true });
    expect(noImage.textureFor(DIRT, blank, AUTOTILE_TOP)).toBe(blank);
  });

  it('falls back to the plain texture when drawing throws', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const failing = new AutotileVariants({ ...factory, toTexture: () => { throw new Error('tainted'); } });
    expect(failing.textureFor(DIRT, base, AUTOTILE_TOP)).toBe(base);
  });
});
