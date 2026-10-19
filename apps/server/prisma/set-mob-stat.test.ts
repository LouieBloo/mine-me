import { describe, it, expect } from 'vitest';
import { parseStat } from './set-mob-stat';

describe('parseStat', () => {
  it('accepts a known stat and a number', () => {
    expect(parseStat('jumpForce', '25.5')).toEqual({ stat: 'jumpForce', value: 25.5 });
    expect(parseStat('moveSpeed', '0')).toEqual({ stat: 'moveSpeed', value: 0 });
  });
  it('rejects an unknown stat', () => {
    expect(() => parseStat('health', '10')).toThrow();
    expect(() => parseStat(undefined, '10')).toThrow();
  });
  it('rejects a missing, negative or non-numeric value', () => {
    for (const bad of [undefined, '', 'x', '-1', 'Infinity']) expect(() => parseStat('jumpForce', bad)).toThrow();
  });
});
