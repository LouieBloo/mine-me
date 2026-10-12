import { describe, it, expect } from 'vitest';
import { computeSpeedDamage } from './damage';

const rule = { minSpeed: 10, perSpeed: 5, max: 40 };

describe('computeSpeedDamage', () => {
  it('deals nothing at or below the minimum speed', () => {
    expect(computeSpeedDamage(0, rule)).toBe(0);
    expect(computeSpeedDamage(9.99, rule)).toBe(0);
    expect(computeSpeedDamage(10, rule)).toBe(0);
  });

  it('scales linearly above the minimum', () => {
    expect(computeSpeedDamage(11, rule)).toBe(5);
    expect(computeSpeedDamage(12, rule)).toBe(10);
    expect(computeSpeedDamage(14, rule)).toBe(20);
  });

  it('is capped by max, and max <= 0 means no cap', () => {
    expect(computeSpeedDamage(50, rule)).toBe(40);
    expect(computeSpeedDamage(50, { ...rule, max: 0 })).toBe(200);
  });

  it('returns 0 for invalid input or a non-positive rate', () => {
    expect(computeSpeedDamage(NaN, rule)).toBe(0);
    expect(computeSpeedDamage(Infinity, rule)).toBe(0);
    expect(computeSpeedDamage(20, { ...rule, perSpeed: 0 })).toBe(0);
    expect(computeSpeedDamage(20, { ...rule, perSpeed: -3 })).toBe(0);
    expect(computeSpeedDamage(20, { ...rule, minSpeed: NaN })).toBe(0);
  });
});
