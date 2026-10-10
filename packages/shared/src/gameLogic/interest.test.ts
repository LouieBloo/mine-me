import { describe, it, expect } from 'vitest';
import { MINING_CONFIG } from '../types/mining';
import { isInInterest, roundWire } from './interest';

const C = { x: 100, y: 100 };
const RX = MINING_CONFIG.INTEREST_RADIUS_X;
const RY = MINING_CONFIG.INTEREST_RADIUS_Y;
const H = MINING_CONFIG.INTEREST_HYSTERESIS;

describe('isInInterest', () => {
  it('includes things inside the box on every side, edges included', () => {
    expect(isInInterest(C, C)).toBe(true);
    expect(isInInterest(C, { x: C.x + RX, y: C.y })).toBe(true);
    expect(isInInterest(C, { x: C.x - RX, y: C.y })).toBe(true);
    expect(isInInterest(C, { x: C.x, y: C.y + RY })).toBe(true);
    expect(isInInterest(C, { x: C.x, y: C.y - RY })).toBe(true);
  });

  it('excludes things beyond the box, horizontally or vertically', () => {
    expect(isInInterest(C, { x: C.x + RX + 0.1, y: C.y })).toBe(false);
    expect(isInInterest(C, { x: C.x, y: C.y - RY - 0.1 })).toBe(false);
  });

  it('keeps something already known a little longer, but not forever', () => {
    const justOut = { x: C.x + RX + 1, y: C.y };
    expect(isInInterest(C, justOut, false)).toBe(false);
    expect(isInInterest(C, justOut, true)).toBe(true);
    expect(isInInterest(C, { x: C.x + RX + H + 0.1, y: C.y }, true)).toBe(false);
    expect(isInInterest(C, { x: C.x, y: C.y + RY + H + 0.1 }, true)).toBe(false);
  });
});

describe('roundWire', () => {
  it('rounds to hundredths', () => {
    expect(roundWire(1.23456)).toBe(1.23);
    expect(roundWire(-7.896)).toBe(-7.9);
    expect(roundWire(3)).toBe(3);
  });
});
