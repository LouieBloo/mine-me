import { describe, it, expect } from 'vitest';
import { isHexColor, lerpColor, multiplyColors, parseCssColor, skyGradientColors, toHexColor } from './surfaceColor';

describe('surface colours', () => {
  it('reads and writes hex colours', () => {
    expect(isHexColor('#87ceeb')).toBe(true);
    expect(isHexColor('87ceeb')).toBe(false);
    expect(isHexColor('#fff')).toBe(false);
    expect(parseCssColor('#87ceeb')).toBe(0x87ceeb);
    expect(parseCssColor('nope', 0x123456)).toBe(0x123456);
    expect(parseCssColor(null)).toBe(0xffffff);
    expect(toHexColor(0x87ceeb)).toBe('#87ceeb');
    expect(toHexColor(0x0000ff)).toBe('#0000ff');
  });

  it('blends and multiplies', () => {
    expect(lerpColor(0x000000, 0xffffff, 0)).toBe(0);
    expect(lerpColor(0x000000, 0xffffff, 1)).toBe(0xffffff);
    expect(lerpColor(0x000000, 0xfefefe, 0.5)).toBe(0x7f7f7f);
    expect(lerpColor(0x000000, 0xffffff, 9)).toBe(0xffffff);
    expect(multiplyColors(0xffffff, 0x8040ff)).toBe(0x8040ff);
    expect(multiplyColors(0x000000, 0xffffff)).toBe(0);
  });

  it('makes a sky gradient from the top to the horizon', () => {
    const colors = skyGradientColors(0x000000, 0xffffff, 5);
    expect(colors).toHaveLength(5);
    expect(colors[0]).toBe(0);
    expect(colors[4]).toBe(0xffffff);
    expect(skyGradientColors(0x112233, 0xffffff, 1)).toEqual([0xffffff]);
  });
});
