import { describe, it, expect } from 'vitest';
import { rollDropTable } from '../src';

/** An rng that returns the given values in order (then repeats the last). */
const seq = (...values: number[]) => {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
};

const item = (itemId: string, chance: number, minQuantity = 1, maxQuantity = 1) => ({ itemId, chance, minQuantity, maxQuantity });

describe('rollDropTable', () => {
  it('returns nothing for a missing or empty table', () => {
    expect(rollDropTable(undefined)).toEqual([]);
    expect(rollDropTable(null)).toEqual([]);
    expect(rollDropTable({})).toEqual([]);
    expect(rollDropTable({ items: [] })).toEqual([]);
    expect(rollDropTable({ items: null })).toEqual([]);
  });

  it('always drops a 100% entry and never a 0% entry', () => {
    const table = { items: [item('always', 100), item('never', 0)] };
    for (const r of [0, 0.5, 0.999999]) {
      expect(rollDropTable(table, { rng: () => r }).map((d) => d.itemId)).toEqual(['always']);
    }
  });

  it('drops when the roll is strictly below the chance', () => {
    const table = { items: [item('a', 25)] };
    expect(rollDropTable(table, { rng: seq(0.2499) })).toHaveLength(1);
    expect(rollDropTable(table, { rng: seq(0.25) })).toHaveLength(0); // exactly 25 is not below 25
    expect(rollDropTable(table, { rng: seq(0.1) })).toHaveLength(1);
  });

  it('matches its chance statistically', () => {
    const table = { items: [item('a', 30)] };
    let state = 12345;
    const lcg = () => ((state = (state * 1664525 + 1013904223) % 4294967296) / 4294967296); // fixed seed
    let hits = 0;
    const trials = 20000;
    for (let i = 0; i < trials; i++) if (rollDropTable(table, { rng: lcg }).length > 0) hits++;
    expect(hits / trials).toBeGreaterThan(0.28);
    expect(hits / trials).toBeLessThan(0.32);
  });

  it('rolls each entry independently', () => {
    const table = { items: [item('a', 50), item('b', 50), item('c', 50)] };
    // chance roll, quantity roll per hit: a hits, b misses, c hits
    const drops = rollDropTable(table, { rng: seq(0.1, 0, 0.9, 0.2, 0) });
    expect(drops.map((d) => d.itemId)).toEqual(['a', 'c']);
  });

  it('picks a quantity between min and max inclusive', () => {
    const table = { items: [item('ore', 100, 2, 5)] };
    const qty = (r: number) => rollDropTable(table, { rng: seq(0, r) })[0].quantity;
    expect(qty(0)).toBe(2);
    expect(qty(0.999999)).toBe(5);
    expect(qty(0.5)).toBe(4); // floor(0.5 * 4) + 2
  });

  it('skips entries that roll a non-positive quantity', () => {
    expect(rollDropTable({ items: [item('x', 100, 0, 0)] })).toEqual([]);
    expect(rollDropTable({ items: [item('x', 100, -3, -1)] })).toEqual([]);
  });

  describe('currency (Sol)', () => {
    it('is ignored unless a currency item is given (block tables)', () => {
      expect(rollDropTable({ items: [], solMin: 10, solMax: 20 })).toEqual([]);
    });

    it('never invents a currency id: no item id, no currency drop', () => {
      expect(rollDropTable({ solMin: 10, solMax: 20 }, { currencyItemId: undefined })).toEqual([]);
      expect(rollDropTable({ solMin: 10, solMax: 20 }, { currencyItemId: '' })).toEqual([]);
    });

    it('rolls the range when a currency item is given (mob tables)', () => {
      const table = { items: [], solMin: 10, solMax: 20 };
      expect(rollDropTable(table, { currencyItemId: 'sol', rng: () => 0 })).toEqual([{ itemId: 'sol', quantity: 10 }]);
      expect(rollDropTable(table, { currencyItemId: 'sol', rng: () => 0.999999 })).toEqual([{ itemId: 'sol', quantity: 20 }]);
    });

    it('treats a missing max as a fixed amount, and pays out as the configured item', () => {
      expect(rollDropTable({ solMin: 7, solMax: 0 }, { currencyItemId: 'coin' })).toEqual([{ itemId: 'coin', quantity: 7 }]);
    });

    it('drops nothing for an empty range', () => {
      expect(rollDropTable({ solMin: 0, solMax: 0 }, { currencyItemId: 'sol' })).toEqual([]);
      expect(rollDropTable({ solMin: null, solMax: null }, { currencyItemId: 'sol' })).toEqual([]);
    });

    it('comes after the item drops', () => {
      const drops = rollDropTable({ items: [item('gem', 100)], solMin: 5, solMax: 5 }, { currencyItemId: 'sol', rng: () => 0 });
      expect(drops.map((d) => d.itemId)).toEqual(['gem', 'sol']);
    });
  });

  it('is deterministic for the same rng sequence', () => {
    const table = { items: [item('a', 60, 1, 9), item('b', 40, 1, 3)], solMin: 1, solMax: 100 };
    const roll = () => rollDropTable(table, { currencyItemId: 'sol', rng: seq(0.3, 0.7, 0.2, 0.9, 0.55) });
    expect(roll()).toEqual(roll());
  });

  it('uses Math.random by default', () => {
    const spy = (globalThis as any).Math;
    const original = spy.random;
    spy.random = () => 0;
    try {
      expect(rollDropTable({ items: [item('a', 100, 3, 3)] })).toEqual([{ itemId: 'a', quantity: 3 }]);
    } finally {
      spy.random = original;
    }
  });
});
