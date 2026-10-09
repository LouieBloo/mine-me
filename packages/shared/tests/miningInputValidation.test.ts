import { describe, it, expect } from 'vitest';
import { sanitizeMiningInput, sanitizeTilePosition, sanitizeWorldPoint } from '../src';

const base = { up: false, down: false, left: true, right: false, miningKey: false, sequence: 3 };

describe('sanitizeTilePosition', () => {
  it('accepts integer coords', () => {
    expect(sanitizeTilePosition({ x: 3, y: 4 })).toEqual({ x: 3, y: 4 });
  });
  it.each([
    [{ x: 1.5, y: 2 }],
    [{ x: NaN, y: 2 }],
    [{ x: Infinity, y: 2 }],
    [{ x: '1', y: 2 }],
    [{ x: 1e12, y: 2 }],
    [{ x: 1 }],
    [null],
    [undefined],
    [[1, 2]],
    ['1,2'],
  ])('rejects %j', (v) => {
    expect(sanitizeTilePosition(v)).toBeNull();
  });
});

describe('sanitizeWorldPoint', () => {
  it('accepts finite floats', () => {
    expect(sanitizeWorldPoint({ x: 1.5, y: -2.25 })).toEqual({ x: 1.5, y: -2.25 });
  });
  it.each([[{ x: NaN, y: 0 }], [{ x: 0, y: Infinity }], [{ x: '0', y: 0 }], [null]])('rejects %j', (v) => {
    expect(sanitizeWorldPoint(v)).toBeNull();
  });
});

describe('sanitizeMiningInput', () => {
  it('accepts a valid input and defaults missing flags to false', () => {
    expect(sanitizeMiningInput({ left: true, sequence: 1 })).toEqual({
      up: false,
      down: false,
      left: true,
      right: false,
      miningKey: false,
      sequence: 1,
    });
  });

  it('strips unknown fields', () => {
    const out = sanitizeMiningInput({ ...base, evil: 'x', __proto__: { a: 1 } }) as any;
    expect(out.evil).toBeUndefined();
  });

  it('normalises aim direction and drops zero vectors', () => {
    const out = sanitizeMiningInput({ ...base, aimDirection: { x: 3, y: 4 } });
    expect(out?.aimDirection?.x).toBeCloseTo(0.6);
    expect(out?.aimDirection?.y).toBeCloseTo(0.8);
    expect(sanitizeMiningInput({ ...base, aimDirection: { x: 0, y: 0 } })?.aimDirection).toBeUndefined();
  });

  it('keeps integer mining targets and null', () => {
    expect(sanitizeMiningInput({ ...base, miningKey: true, miningTarget: { x: 2, y: 5 } })?.miningTarget).toEqual({ x: 2, y: 5 });
    expect(sanitizeMiningInput({ ...base, miningTarget: null })?.miningTarget).toBeNull();
  });

  it.each([
    ['non-object', 'hello'],
    ['null', null],
    ['array', []],
    ['string flag', { ...base, left: 'true' }],
    ['numeric flag', { ...base, miningKey: 1 }],
    ['float target', { ...base, miningTarget: { x: 1.5, y: 2 } }],
    ['NaN target', { ...base, miningTarget: { x: NaN, y: 2 } }],
    ['string target', { ...base, miningTarget: '1,2' }],
    ['NaN aim', { ...base, aimDirection: { x: NaN, y: 1 } }],
    ['Infinity aim', { ...base, aimDirection: { x: Infinity, y: 1 } }],
    ['negative sequence', { ...base, sequence: -1 }],
    ['float sequence', { ...base, sequence: 1.5 }],
    ['string sequence', { ...base, sequence: '1' }],
    ['bad facing', { ...base, isFacingLeft: 'yes' }],
  ])('rejects %s', (_name, payload) => {
    expect(sanitizeMiningInput(payload)).toBeNull();
  });
});
