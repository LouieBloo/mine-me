import { describe, it, expect } from 'vitest';
import { SURFACE_FADE_BLOCKS, SURFACE_FADE_START_BLOCKS, layerTileOffset, skyInView, surfaceFade, visibleSkyBand } from './surfaceView';

describe('layerTileOffset', () => {
  it('sticks to the terrain at parallax 0, stays on the screen at 1, and moves part of the way between', () => {
    // The point drawn at layer coordinate u appears at world x = u + viewLeft * p
    for (const [p, expectedShift] of [[0, 0], [1, 500], [0.5, 250]] as const) {
      const viewLeft = 500;
      const worldX = (u: number) => viewLeft + (u + layerTileOffset(viewLeft, p));
      expect(worldX(100) - 100).toBeCloseTo(expectedShift);
    }
  });

  it('clamps a bad factor', () => {
    expect(layerTileOffset(100, 5)).toBe(layerTileOffset(100, 1));
    expect(layerTileOffset(100, -2)).toBe(layerTileOffset(100, 0));
    expect(layerTileOffset(100, NaN)).toBe(layerTileOffset(100, 0));
  });
});

describe('surfaceFade', () => {
  const tile = 21;
  it('is full at and just below the horizon, falls to nothing deeper, and never grows back', () => {
    expect(surfaceFade(0, 0, tile)).toBe(1);
    expect(surfaceFade(-500, 0, tile)).toBe(1);
    expect(surfaceFade(SURFACE_FADE_START_BLOCKS * tile, 0, tile)).toBe(1);
    expect(surfaceFade(SURFACE_FADE_BLOCKS * tile, 0, tile)).toBe(0);
    expect(surfaceFade(1000 * tile, 0, tile)).toBe(0);
    let last = 1;
    for (let y = 0; y < 20 * tile; y += 3) {
      const f = surfaceFade(y, 0, tile);
      expect(f).toBeLessThanOrEqual(last + 1e-9);
      last = f;
    }
  });
});

describe('skyInView', () => {
  it('shows sky only when the top of the view is above the horizon (underground nothing is drawn)', () => {
    expect(skyInView(-100, 0)).toBe(true);
    expect(skyInView(0, 0)).toBe(false);
    expect(skyInView(300, 0)).toBe(false);
    expect(visibleSkyBand(-100, 40)).toEqual({ top: -100, bottom: 40 });
    expect(visibleSkyBand(300, 40)).toBeNull();
  });
});
