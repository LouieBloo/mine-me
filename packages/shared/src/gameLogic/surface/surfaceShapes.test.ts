import { describe, it, expect } from 'vitest';
import { boltBranch, cloudPuffs, lightningBolt, silhouettePolygon } from './surfaceShapes';

describe('silhouettePolygon', () => {
  it('stands on the bottom edge, with its tops at the heights, and closes the strip so it tiles', () => {
    const points = silhouettePolygon([1, 0.5, 0.2, 0.5], 100, 40);
    expect(points.slice(0, 2)).toEqual([0, 40]);
    // x, y pairs: the first height is a full-height peak
    expect(points.slice(2, 4)).toEqual([0, 0]);
    expect(points.slice(4, 6)).toEqual([25, 20]);
    // The right edge repeats the first height, so the left and right edges of a tile match
    expect(points.slice(-4)).toEqual([100, 0, 100, 40]);
    expect(points.length % 2).toBe(0);
  });

  it('never goes outside its box', () => {
    const points = silhouettePolygon([0.2, 1, 0.6], 90, 30);
    for (let i = 0; i < points.length; i += 2) {
      expect(points[i]).toBeGreaterThanOrEqual(0);
      expect(points[i]).toBeLessThanOrEqual(90);
      expect(points[i + 1]).toBeGreaterThanOrEqual(0);
      expect(points[i + 1]).toBeLessThanOrEqual(30);
    }
  });

  it('copes with too few heights', () => {
    expect(silhouettePolygon([], 10, 10).length).toBe(8);
    expect(silhouettePolygon([0.5], 10, 10).length).toBe(8);
  });
});

describe('cloudPuffs', () => {
  it('is deterministic, differs between variants, and stays inside the box', () => {
    expect(cloudPuffs(3)).toEqual(cloudPuffs(3));
    expect(cloudPuffs(3)).not.toEqual(cloudPuffs(4));
    for (const v of [0, 1, 2, 7, 999]) {
      const puffs = cloudPuffs(v);
      expect(puffs.length).toBeGreaterThanOrEqual(5);
      for (const p of puffs) {
        expect(p.x - p.rx).toBeGreaterThanOrEqual(-0.01);
        expect(p.x + p.rx).toBeLessThanOrEqual(1.01);
        expect(p.y - p.ry).toBeGreaterThanOrEqual(-0.01);
        expect(p.y + p.ry).toBeLessThanOrEqual(1.01);
      }
    }
  });
});

describe('lightningBolt', () => {
  it('runs from the top down to the bottom in steps, wandering sideways', () => {
    const points = lightningBolt(5, 100, 0, 200, 8, 30);
    expect(points.slice(0, 2)).toEqual([100, 0]);
    expect(points[points.length - 1]).toBe(200);
    expect(points).toHaveLength((8 + 1) * 2);
    for (let i = 3; i < points.length; i += 2) expect(points[i]).toBeGreaterThan(points[i - 2]);
    for (let i = 2; i < points.length; i += 2) expect(Math.abs(points[i] - points[i - 2])).toBeLessThanOrEqual(30);
  });

  it('is the same for the same seed and different for another', () => {
    expect(lightningBolt(1, 0, 0, 100)).toEqual(lightningBolt(1, 0, 0, 100));
    expect(lightningBolt(1, 0, 0, 100)).not.toEqual(lightningBolt(2, 0, 0, 100));
  });

  it('branches off a point, going out and down', () => {
    const branch = boltBranch(3, { x: 50, y: 80 }, 40);
    expect(branch.slice(0, 2)).toEqual([50, 80]);
    expect(branch[branch.length - 1]).toBeGreaterThan(80);
    expect(Math.abs(branch[4] - 50)).toBe(40);
  });
});
