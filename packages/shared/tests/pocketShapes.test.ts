import { describe, it, expect } from 'vitest';
import { generatePocketOutline, isConnected, pickPocketShape, VEIN_REACH } from '../src/gameLogic/pocketShapes';
import { resolveShapeWeights, validateFluidGeneration, type PocketShape } from '../src/index';
import { validateGasGeneration } from '../src/types/gas';

/** A small deterministic generator, so a failing seed can be replayed. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SHAPES: PocketShape[] = ['SQUARE', 'RECTANGLE', 'VEIN'];

describe('generatePocketOutline', () => {
  it('always gives one connected region, with no duplicate cells, whatever the shape or seed', () => {
    for (const shape of SHAPES) {
      for (let seed = 1; seed <= 300; seed++) {
        const outline = generatePocketOutline(shape, 2, 5, seeded(seed));
        expect(isConnected(outline.cells), `${shape} seed ${seed}`).toBe(true);
        expect(new Set(outline.cells.map((c) => `${c.x},${c.y}`)).size).toBe(outline.cells.length);
      }
    }
  });

  it('keeps every cell inside the reported box, with the box touching the origin', () => {
    for (const shape of SHAPES) {
      for (let seed = 1; seed <= 100; seed++) {
        const o = generatePocketOutline(shape, 1, 4, seeded(seed));
        expect(Math.min(...o.cells.map((c) => c.x))).toBe(0);
        expect(Math.min(...o.cells.map((c) => c.y))).toBe(0);
        expect(Math.max(...o.cells.map((c) => c.x))).toBe(o.width - 1);
        expect(Math.max(...o.cells.map((c) => c.y))).toBe(o.height - 1);
      }
    }
  });

  it('squares are square and rectangles stay inside the size range', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const sq = generatePocketOutline('SQUARE', 2, 5, seeded(seed));
      expect(sq.width).toBe(sq.height);
      expect(sq.cells).toHaveLength(sq.width * sq.height);
      const rect = generatePocketOutline('RECTANGLE', 2, 5, seeded(seed));
      expect(rect.width).toBeGreaterThanOrEqual(2);
      expect(rect.width).toBeLessThanOrEqual(5);
      expect(rect.height).toBeGreaterThanOrEqual(2);
      expect(rect.height).toBeLessThanOrEqual(5);
    }
  });

  it('rectangles are not always squares', () => {
    const lopsided = Array.from({ length: 100 }, (_, i) => generatePocketOutline('RECTANGLE', 2, 5, seeded(i + 1))).filter((o) => o.width !== o.height);
    expect(lopsided.length).toBeGreaterThan(30);
  });

  it('a vein has as many cells as a square of a drawn side would, and is not just a box', () => {
    let notBoxes = 0;
    for (let seed = 1; seed <= 100; seed++) {
      const v = generatePocketOutline('VEIN', 3, 3, seeded(seed));
      expect(v.cells).toHaveLength(9);
      expect(v.width).toBeLessThanOrEqual(3 * VEIN_REACH * 2 + 1);
      if (v.cells.length < v.width * v.height) notBoxes++;
    }
    expect(notBoxes).toBeGreaterThan(70);
  });

  it('is deterministic for a seed', () => {
    for (const shape of SHAPES) {
      expect(generatePocketOutline(shape, 2, 5, seeded(42))).toEqual(generatePocketOutline(shape, 2, 5, seeded(42)));
    }
  });
});

describe('isConnected', () => {
  it('sees a gap and a diagonal as disconnected', () => {
    expect(isConnected([{ x: 0, y: 0 }, { x: 2, y: 0 }])).toBe(false);
    expect(isConnected([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toBe(false);
    expect(isConnected([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }])).toBe(true);
  });
});

describe('pickPocketShape and weights', () => {
  it('uses all three shapes equally when no weights are given', () => {
    const rng = seeded(7);
    const counts = { SQUARE: 0, RECTANGLE: 0, VEIN: 0 } as Record<PocketShape, number>;
    for (let i = 0; i < 3000; i++) counts[pickPocketShape(undefined, rng)]++;
    for (const shape of SHAPES) expect(counts[shape]).toBeGreaterThan(800);
  });

  it('follows the weights, and a weight of 0 never happens', () => {
    const rng = seeded(9);
    for (let i = 0; i < 500; i++) expect(pickPocketShape({ VEIN: 1 }, rng)).toBe('VEIN');
    const mix = Array.from({ length: 2000 }, () => pickPocketShape({ SQUARE: 1, VEIN: 3 }, rng));
    expect(mix).not.toContain('RECTANGLE');
    expect(mix.filter((s) => s === 'VEIN').length).toBeGreaterThan(mix.filter((s) => s === 'SQUARE').length * 2);
  });

  it('listing shapes means the missing ones are off, and all-zero falls back to everything', () => {
    expect(resolveShapeWeights({ SQUARE: 2 })).toEqual({ SQUARE: 2, RECTANGLE: 0, VEIN: 0 });
    expect(resolveShapeWeights({ SQUARE: 0 })).toEqual({ SQUARE: 1, RECTANGLE: 1, VEIN: 1 });
    expect(resolveShapeWeights(null)).toEqual({ SQUARE: 1, RECTANGLE: 1, VEIN: 1 });
  });
});

describe('generation validation for shapes and mode', () => {
  const base = { minDepth: 2, percentage: 5, minSize: 2, maxSize: 4 };
  it('accepts shapes, and a pool mode on fluids', () => {
    expect(validateFluidGeneration({ ...base, shapes: { VEIN: 2, SQUARE: 1 } })).toEqual([]);
    expect(validateFluidGeneration({ ...base, mode: 'POOL' })).toEqual([]);
  });
  it('rejects unknown shapes, negative weights, all-zero weights and an unknown mode', () => {
    expect(validateFluidGeneration({ ...base, shapes: { BLOB: 1 } })).toContain('generation.shapes.BLOB is not a shape');
    expect(validateFluidGeneration({ ...base, shapes: { VEIN: -1 } })).toContain('generation.shapes.VEIN must be 0 or more');
    expect(validateFluidGeneration({ ...base, shapes: { VEIN: 0 } })).toContain('generation.shapes needs at least one shape above 0');
    expect(validateFluidGeneration({ ...base, mode: 'LAKE' })).toContain('generation.mode must be POCKET or POOL');
  });
  it('gases take shapes but not the pool mode', () => {
    expect(validateGasGeneration({ ...base, shapes: { VEIN: 1 } })).toEqual([]);
    expect(validateGasGeneration({ ...base, mode: 'POOL' }).length).toBe(1);
  });
});
