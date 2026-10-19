import { describe, it, expect } from 'vitest';
import { parsePercentage } from './set-rock-percentage';

describe('parsePercentage', () => {
  it('accepts whole numbers from 0 to 50', () => {
    expect(parsePercentage('6')).toBe(6);
    expect(parsePercentage('0')).toBe(0);
    expect(parsePercentage('50')).toBe(50);
  });
  it('rejects anything else', () => {
    for (const bad of [undefined, '', 'x', '6.5', '-1', '51']) expect(() => parsePercentage(bad)).toThrow();
  });
});
