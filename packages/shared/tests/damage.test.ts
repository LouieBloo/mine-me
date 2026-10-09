import { describe, it, expect } from 'vitest';
import { isValidDamageAmount, knockbackAway } from '../src';

describe('isValidDamageAmount', () => {
  it.each([1, 0.5, 9999])('accepts %s', (v) => expect(isValidDamageAmount(v)).toBe(true));
  it.each([0, -1, NaN, Infinity, -Infinity, '5', null, undefined, {}])('rejects %s', (v) =>
    expect(isValidDamageAmount(v)).toBe(false)
  );
});

describe('knockbackAway', () => {
  const mag = { x: 5, y: -4 };
  it('pushes the target away from a source on its left', () => expect(knockbackAway(1, 3, mag)).toEqual({ x: 5, y: -4 }));
  it('pushes the target away from a source on its right', () => expect(knockbackAway(3, 1, mag)).toEqual({ x: -5, y: -4 }));
  it('uses the fallback direction when aligned', () => {
    expect(knockbackAway(2, 2, mag, -1)).toEqual({ x: -5, y: -4 });
    expect(knockbackAway(2, 2, mag)).toEqual({ x: 5, y: -4 });
  });
});
