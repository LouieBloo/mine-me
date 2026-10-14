import { describe, it, expect } from 'vitest';
import { bodyTouchesCell, distanceToCell, heatDamageRate, heatFalloff, type BodyBox } from '../src/index';

const box = (x: number, y: number, halfWidth = 0.3, halfHeight = 0.8): BodyBox => ({ x, y, halfWidth, halfHeight });

describe('bodyTouchesCell', () => {
  it('is true when the box overlaps the cell', () => {
    expect(bodyTouchesCell(box(5.5, 5.5), 5, 5)).toBe(true);
    expect(bodyTouchesCell(box(5.5, 5.5), 5, 6)).toBe(true); // a tall body reaches the cell below
    expect(bodyTouchesCell(box(5.5, 5.5), 5, 4)).toBe(true);
  });

  it('is false for cells it only borders or is clear of', () => {
    expect(bodyTouchesCell(box(5.5, 5.5), 6, 5)).toBe(false); // 5.8 < 6
    expect(bodyTouchesCell(box(5.5, 5.5), 5, 7)).toBe(false); // body bottom is 6.3 -> overlaps row 6 only
    expect(bodyTouchesCell(box(5.5, 5.5, 0.5, 0.5), 6, 5)).toBe(false); // edges exactly touching
  });

  it('counts a body straddling two columns as touching both', () => {
    expect(bodyTouchesCell(box(6.0, 5.5), 5, 5)).toBe(true);
    expect(bodyTouchesCell(box(6.0, 5.5), 6, 5)).toBe(true);
  });
});

describe('distanceToCell', () => {
  it('is 0 when touching or inside', () => {
    expect(distanceToCell(box(5.5, 5.5), 5, 5)).toBe(0);
    expect(distanceToCell(box(5.5, 5.5, 0.5, 0.5), 6, 5)).toBe(0);
  });

  it('measures to the nearest edge, sideways', () => {
    expect(distanceToCell(box(5.5, 5.5), 8, 5)).toBeCloseTo(8 - 5.8, 5);
    expect(distanceToCell(box(5.5, 5.5), 2, 5)).toBeCloseTo(5.2 - 3, 5);
  });

  it('measures to the nearest edge, vertically, and diagonally', () => {
    expect(distanceToCell(box(5.5, 5.5), 5, 9)).toBeCloseTo(9 - 6.3, 5);
    expect(distanceToCell(box(5.5, 5.5, 0.5, 0.5), 8, 8)).toBeCloseTo(Math.hypot(2, 2), 5);
  });
});

describe('heatFalloff', () => {
  it('is full at the fire, fades in a straight line, and is nothing at the radius and beyond', () => {
    expect(heatFalloff(0, 2.5)).toBe(1);
    expect(heatFalloff(1.25, 2.5)).toBeCloseTo(0.5, 5);
    expect(heatFalloff(2.5, 2.5)).toBe(0);
    expect(heatFalloff(9, 2.5)).toBe(0);
  });

  it('is nothing for no radius or a nonsense distance', () => {
    expect(heatFalloff(0, 0)).toBe(0);
    expect(heatFalloff(-1, 2.5)).toBe(0);
    expect(heatFalloff(NaN, 2.5)).toBe(0);
  });
});

describe('heatDamageRate', () => {
  const rule = { heatRadius: 2.5, heatDamagePerSecond: 1.5 };

  it('scales with the material\'s heat and fades with distance', () => {
    expect(heatDamageRate(3, 0, rule)).toBeCloseTo(4.5, 5);
    expect(heatDamageRate(3, 1.25, rule)).toBeCloseTo(2.25, 5);
    expect(heatDamageRate(6, 0, rule)).toBeCloseTo(9, 5);
    expect(heatDamageRate(3, 2.5, rule)).toBe(0);
  });

  it('is nothing for a fire with no heat or a rule with no damage', () => {
    expect(heatDamageRate(0, 0, rule)).toBe(0);
    expect(heatDamageRate(3, 0, { ...rule, heatDamagePerSecond: 0 })).toBe(0);
  });
});
