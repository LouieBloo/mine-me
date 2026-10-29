import { describe, it, expect } from 'vitest';
import { silhouetteHeights } from './silhouette';

describe('silhouetteHeights', () => {
  it('stays between a fifth and the full height, whatever the shape', () => {
    for (const shape of ['mountains', 'hills', 'treeline'] as const) {
      const h = silhouetteHeights(shape, 5, 256);
      expect(h).toHaveLength(256);
      expect(Math.min(...h)).toBeGreaterThanOrEqual(0.2 - 1e-9);
      expect(Math.max(...h)).toBeLessThanOrEqual(1 + 1e-9);
    }
  });

  it('is flat for a flat layer', () => {
    expect(new Set(silhouetteHeights('flat', 1, 16))).toEqual(new Set([1]));
  });

  it('tiles: the step from the last sample back to the first is as small as any other step (no seam)', () => {
    for (const shape of ['mountains', 'hills'] as const) {
      const n = 512;
      const h = silhouetteHeights(shape, 9, n);
      const steps = h.map((v, i) => Math.abs(h[(i + 1) % n] - v));
      expect(steps[n - 1]).toBeLessThan(Math.max(...steps.slice(0, n - 1)) + 1e-9);
    }
  });

  it('is deterministic per seed, differs between seeds, and mountains are more jagged than hills', () => {
    expect(silhouetteHeights('hills', 3, 64)).toEqual(silhouetteHeights('hills', 3, 64));
    expect(silhouetteHeights('hills', 3, 64)).not.toEqual(silhouetteHeights('hills', 4, 64));
    const rough = (h: number[]) => h.reduce((s, v, i) => s + Math.abs(v - h[(i + 1) % h.length]), 0);
    expect(rough(silhouetteHeights('mountains', 3, 256))).toBeGreaterThan(rough(silhouetteHeights('hills', 3, 256)));
  });
});
