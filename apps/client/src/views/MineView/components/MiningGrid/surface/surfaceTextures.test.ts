import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Texture } from 'pixi.js';
import { cloudTexture, fogTexture, paintTexture, rainTexture, silhouetteTexture, snowTexture, splashTexture, type CanvasFactory, type PaintContext } from './surfaceTextures';

let from: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  from = vi.spyOn(Texture, 'from').mockReturnValue({ fake: true } as never);
});
afterEach(() => from.mockRestore());

function fakeContext() {
  const calls: string[] = [];
  const record = (name: string) => (..._args: unknown[]) => { calls.push(name); };
  const ctx = {
    clearRect: record('clearRect'),
    beginPath: record('beginPath'),
    moveTo: record('moveTo'),
    lineTo: record('lineTo'),
    closePath: record('closePath'),
    fill: record('fill'),
    stroke: record('stroke'),
    ellipse: record('ellipse'),
    fillRect: record('fillRect'),
    createLinearGradient: () => ({ addColorStop: record('addColorStop') }),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    lineCap: 'butt',
    globalAlpha: 1,
  } as unknown as PaintContext;
  const factory: CanvasFactory = (width, height) => ({ width, height, getContext: () => ctx });
  return { ctx, calls, factory };
}

describe('paintTexture', () => {
  it('falls back to the white texture when there is no canvas or no context', () => {
    const paint = vi.fn();
    expect(paintTexture(10, 10, paint, () => null)).toBe(Texture.WHITE);
    expect(paintTexture(10, 10, paint, () => ({ width: 10, height: 10, getContext: () => null }))).toBe(Texture.WHITE);
    expect(paintTexture(10, 10, paint, () => ({ width: 10, height: 10, getContext: () => { throw new Error('no'); } }))).toBe(Texture.WHITE);
    expect(paint).not.toHaveBeenCalled();
  });

  it('paints on a canvas of the (rounded, at least 1) size it was asked for', () => {
    const { factory } = fakeContext();
    const sizes: number[][] = [];
    const sized: CanvasFactory = (w, h) => { sizes.push([w, h]); return factory(w, h); };
    expect(paintTexture(10.4, 0, vi.fn(), sized)).toEqual({ fake: true });
    expect(sizes).toEqual([[10, 1]]);
  });
});

describe('the procedural pictures', () => {
  it('draws a silhouette as one filled polygon in the colour asked for', () => {
    const { ctx, calls, factory } = fakeContext();
    silhouetteTexture('mountains', 3, 0x8fa8c8, 512, 64, factory);
    expect(ctx.fillStyle).toBe('#8fa8c8');
    expect(calls.filter((c) => c === 'fill')).toHaveLength(1);
    expect(calls.filter((c) => c === 'lineTo').length).toBeGreaterThan(20);
    expect(calls).toContain('closePath');
  });

  it('draws a cloud as several puffs', () => {
    const { calls, factory } = fakeContext();
    cloudTexture(1, 128, 64, factory);
    expect(calls.filter((c) => c === 'ellipse').length).toBeGreaterThanOrEqual(5);
  });

  it('draws the rain streak, flake, fog band and splash', () => {
    for (const make of [rainTexture, snowTexture, fogTexture, splashTexture]) {
      const { calls, factory } = fakeContext();
      make(factory);
      expect(calls.length).toBeGreaterThan(0);
    }
  });
});
