import { describe, it, expect } from 'vitest';
import { calculateTravelDays } from './city';

const makeCity = (id: string, x: number, y: number) => ({
  id,
  name: `City ${id}`,
  description: '',
  worldPositionX: x,
  worldPositionY: y,
});

describe('calculateTravelDays', () => {
  it('returns 0 for the same city (by id)', () => {
    const city = makeCity('a', 20, 30);
    expect(calculateTravelDays(city, city)).toBe(0);
  });

  it('correctly computes a 3-4-5 right triangle (exact integer)', () => {
    // dx=3, dy=4 → sqrt(25)=5
    expect(calculateTravelDays(makeCity('a', 0, 0), makeCity('b', 3, 4))).toBe(5);
  });

  it('correctly computes a 6-8-10 right triangle (exact integer)', () => {
    expect(calculateTravelDays(makeCity('a', 0, 0), makeCity('b', 6, 8))).toBe(10);
  });

  it('correctly computes a 60-80-100 right triangle', () => {
    expect(calculateTravelDays(makeCity('a', 0, 0), makeCity('b', 60, 80))).toBe(100);
  });

  it('correctly computes a 21-28-35 right triangle', () => {
    // The exact scenario from user bug report: map said 35, expected 35 days of aging
    expect(calculateTravelDays(makeCity('a', 0, 0), makeCity('b', 21, 28))).toBe(35);
  });

  it('ceils non-integer distances (dx=1, dy=1 → sqrt(2) ≈ 1.41 → 2)', () => {
    expect(calculateTravelDays(makeCity('a', 0, 0), makeCity('b', 1, 1))).toBe(2);
  });

  it('is commutative — A→B equals B→A', () => {
    const a = makeCity('a', 10, 20);
    const b = makeCity('b', 45, 75);
    expect(calculateTravelDays(a, b)).toBe(calculateTravelDays(b, a));
  });

  it('uses 50,50 as default coordinates when worldPosition is missing', () => {
    // cityA missing coords → defaults to (50,50); cityB at (50,80) → dy=30, dx=0
    const a = { id: 'a', name: 'A', description: '' };
    const b = makeCity('b', 50, 80);
    expect(calculateTravelDays(a, b)).toBe(30);
  });

  it('handles purely horizontal travel (dy=0)', () => {
    expect(calculateTravelDays(makeCity('a', 10, 50), makeCity('b', 50, 50))).toBe(40);
  });

  it('handles purely vertical travel (dx=0)', () => {
    expect(calculateTravelDays(makeCity('a', 50, 10), makeCity('b', 50, 50))).toBe(40);
  });

  it('handles cities at the exact same coordinates but different ids (returns ceil of 0 = 0)', () => {
    const a = makeCity('a', 25, 25);
    const b = { ...makeCity('b', 25, 25) };
    // same position but different id → distance is 0
    expect(calculateTravelDays(a, b)).toBe(0);
  });
});
