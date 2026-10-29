import { describe, it, expect } from 'vitest';
import { ROCK_SHAPES, pickRockShape, rockMass } from './rockShapes';

describe('rock shapes', () => {
  it('offers a 2x1, a 3x1, a 2x2 and a 3x3, and no lone 1x1 block', () => {
    expect(ROCK_SHAPES.map((s) => s.id)).toEqual(['2x1', '3x1', '2x2', '3x3']);
    for (const s of ROCK_SHAPES) expect(s.id).toBe(`${s.width}x${s.height}`);
  });

  it('small rocks are the most likely and a 3x3 the least', () => {
    const weight = (id: string) => ROCK_SHAPES.find((s) => s.id === id)!.weight;
    expect(weight('2x1')).toBeGreaterThan(weight('3x1'));
    expect(weight('3x3')).toBeLessThan(weight('2x2'));
  });

  it('mass is the number of cells covered', () => {
    expect(rockMass({ width: 1, height: 1 })).toBe(1);
    expect(rockMass({ width: 3, height: 1 })).toBe(3);
    expect(rockMass({ width: 3, height: 3 })).toBe(9);
  });

  describe('pickRockShape', () => {
    it('follows the weights across the roll', () => {
      expect(pickRockShape(0)!.id).toBe('2x1');
      expect(pickRockShape(0.999)!.id).toBe('3x3');
      const counts: Record<string, number> = {};
      for (let i = 0; i < 1000; i++) {
        const id = pickRockShape(i / 1000)!.id;
        counts[id] = (counts[id] ?? 0) + 1;
      }
      const total = ROCK_SHAPES.reduce((n, s) => n + s.weight, 0);
      for (const s of ROCK_SHAPES) expect(counts[s.id] / 1000).toBeCloseTo(s.weight / total, 1);
    });

    it('only picks from the shapes allowed, and is null when none is', () => {
      for (let i = 0; i < 20; i++) expect(pickRockShape(i / 20, (s) => s.width * s.height <= 2)!.width * 1).toBeLessThanOrEqual(2);
      expect(pickRockShape(0.5, () => false)).toBeNull();
    });
  });
});
