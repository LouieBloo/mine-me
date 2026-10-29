import { describe, it, expect } from 'vitest';
import { CLOUD_PERIOD_PX, MAX_CLOUDS, cloudAlpha, cloudSpecs, cloudX } from './clouds';

describe('cloudSpecs', () => {
  it('is deterministic per seed and capped', () => {
    expect(cloudSpecs(1, 10)).toEqual(cloudSpecs(1, 10));
    expect(cloudSpecs(1, 10)).not.toEqual(cloudSpecs(2, 10));
    expect(cloudSpecs(1, 1000)).toHaveLength(MAX_CLOUDS);
    expect(cloudSpecs(1, 0)).toEqual([]);
  });

  it('spreads thresholds so thicker cover shows more clouds', () => {
    const clouds = cloudSpecs(3, 12);
    const shown = (density: number) => clouds.filter((c) => cloudAlpha(c, density) > 0).length;
    expect(shown(0.1)).toBeLessThan(shown(0.5));
    expect(shown(0.5)).toBeLessThan(shown(1));
    expect(shown(1)).toBe(12);
  });
});

describe('cloudAlpha', () => {
  it('fades in just above the threshold', () => {
    expect(cloudAlpha({ threshold: 0.5 }, 0.4)).toBe(0);
    expect(cloudAlpha({ threshold: 0.5 }, 0.55)).toBeCloseTo(0.5);
    expect(cloudAlpha({ threshold: 0.5 }, 0.9)).toBe(1);
  });
});

describe('cloudX', () => {
  it('is the same for the same time, drifts right, and wraps round the period', () => {
    const c = { x0: 0.5, speed: 10 };
    expect(cloudX(c, 100)).toBe(cloudX(c, 100));
    expect(cloudX(c, 10)).toBeCloseTo(CLOUD_PERIOD_PX * 0.5 + 100);
    expect(cloudX(c, 100000)).toBeGreaterThanOrEqual(0);
    expect(cloudX(c, 100000)).toBeLessThan(CLOUD_PERIOD_PX);
    expect(cloudX({ x0: 0.99, speed: 100 }, 100)).toBeLessThan(CLOUD_PERIOD_PX);
  });
});
