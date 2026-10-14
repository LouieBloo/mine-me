import { describe, it, expect } from 'vitest';
import { FluidField, crossFluidSurface, quantizeFluidLevel, sampleFluidContact, fluidMovementFactor, movementFactorAt, type FluidEnvironment } from '../src/index';

const q = quantizeFluidLevel;

/** A 6x6 field; the body is 0.6 wide and 1.6 tall like a player. */
const HW = 0.3;
const HH = 0.8;
const field = (cells: Array<[number, number, number, number]>) => {
  const f = new FluidField(6, 6);
  f.apply(cells.map(([x, y, id, level]) => [x, y, id, q(level)] as [number, number, number, number]));
  return f;
};

describe('sampleFluidContact', () => {
  it('is dry with no fluid', () => {
    expect(sampleFluidContact(field([]), 2.5, 4.2, HW, HH)).toBeNull();
  });

  it('measures how much of the body height is in a pool', () => {
    // Standing on the floor at y=5: body spans 3.4..5.0 (centre 4.2). One full cell below row 4 (4..5) covers 1.0 of 1.6
    const contact = sampleFluidContact(field([[2, 4, 1, 1]]), 2.5, 4.2, HW, HH)!;
    expect(contact.fluidId).toBe(1);
    expect(contact.submerged).toBeCloseTo(1 / 1.6, 2);
  });

  it('counts only the filled part of a partial cell, from the bottom up', () => {
    const contact = sampleFluidContact(field([[2, 4, 1, 0.5]]), 2.5, 4.2, HW, HH)!;
    expect(contact.submerged).toBeCloseTo(0.5 / 1.6, 2);
  });

  it('treats a cell with the same fluid above it as full', () => {
    const contact = sampleFluidContact(field([[2, 3, 1, 0.1], [2, 4, 1, 0.1]]), 2.5, 4.2, HW, HH)!;
    // Row 4 counts as full (1.0); row 3 is 0.1 deep from its bottom, which sits inside the body's top 0.4
    expect(contact.submerged).toBeCloseTo((1 + 0.1) / 1.6, 1);
  });

  it('is fully submerged when the body sits inside deep fluid, and never above 1', () => {
    const cells: Array<[number, number, number, number]> = [];
    for (let y = 2; y <= 5; y++) cells.push([2, y, 1, 1]);
    expect(sampleFluidContact(field(cells), 2.5, 4.0, HW, HH)!.submerged).toBe(1);
  });

  it('ignores fluid the body is not touching', () => {
    expect(sampleFluidContact(field([[4, 4, 1, 1]]), 2.5, 4.2, HW, HH)).toBeNull();
    expect(sampleFluidContact(field([[2, 5, 1, 1]]), 2.5, 3.5, HW, HH)).toBeNull();
  });

  it('averages over the columns a wide body spans', () => {
    // Body straddles columns 2 and 3 (centre x=3.0), fluid in only one of them
    const contact = sampleFluidContact(field([[2, 4, 1, 1]]), 3.0, 4.2, HW, HH)!;
    expect(contact.submerged).toBeCloseTo(1 / 1.6 / 2, 2);
  });

  it('picks the deepest fluid when two touch the body', () => {
    const contact = sampleFluidContact(field([[2, 4, 1, 1], [2, 3, 2, 0.2]]), 2.5, 4.2, HW, HH)!;
    expect(contact.fluidId).toBe(1);
  });

  it('copes with cells outside the field', () => {
    expect(sampleFluidContact(field([]), -3, -3, HW, HH)).toBeNull();
    expect(sampleFluidContact(field([]), 2.5, 4.2, 0, 0)).toBeNull();
  });
});

describe('fluidMovementFactor', () => {
  it('slows by viscosity times how deep, and stays within 0 and 1', () => {
    expect(fluidMovementFactor(0.6, 1)).toBeCloseTo(0.4, 5);
    expect(fluidMovementFactor(0.6, 0.5)).toBeCloseTo(0.7, 5);
    expect(fluidMovementFactor(0.6, 0)).toBe(1);
    expect(fluidMovementFactor(0, 1)).toBe(1);
    expect(fluidMovementFactor(1, 1)).toBe(0);
    expect(fluidMovementFactor(2, 1)).toBe(0);
    expect(fluidMovementFactor(NaN, 1)).toBe(1);
  });
});

describe('movementFactorAt', () => {
  const env = (f: FluidField): FluidEnvironment => ({
    sampler: f,
    propertiesOf: (id) => (id === 1 ? { viscosity: 0.6, density: 0.8 } : undefined),
  });

  it('is 1 with no environment, no fluid, or a fluid nobody knows', () => {
    expect(movementFactorAt(null, 2.5, 4.2, HW, HH)).toBe(1);
    expect(movementFactorAt(undefined, 2.5, 4.2, HW, HH)).toBe(1);
    expect(movementFactorAt(env(field([])), 2.5, 4.2, HW, HH)).toBe(1);
    expect(movementFactorAt(env(field([[2, 4, 7, 1]])), 2.5, 4.2, HW, HH)).toBe(1);
  });

  it('slows a body wading in a known fluid', () => {
    const factor = movementFactorAt(env(field([[2, 4, 1, 1]])), 2.5, 4.2, HW, HH);
    expect(factor).toBeCloseTo(1 - 0.6 * (1 / 1.6), 2);
  });
});

describe('crossFluidSurface', () => {
  const ENTER = 0.3;
  const EXIT = 0.1;
  const contact = (fluidId: number, submerged: number) => ({ fluidId, submerged });

  it('does nothing for a body that stays dry or stays only a little wet', () => {
    expect(crossFluidSurface(0, null, ENTER, EXIT)).toEqual({ fluidId: 0, crossings: [] });
    expect(crossFluidSurface(0, contact(1, 0.29), ENTER, EXIT)).toEqual({ fluidId: 0, crossings: [] });
  });

  it('enters once it is deep enough, and reports the fluid', () => {
    expect(crossFluidSurface(0, contact(1, 0.3), ENTER, EXIT)).toEqual({ fluidId: 1, crossings: [{ kind: 'enter', fluidId: 1 }] });
  });

  it('does not enter again while it stays in', () => {
    expect(crossFluidSurface(1, contact(1, 0.9), ENTER, EXIT)).toEqual({ fluidId: 1, crossings: [] });
  });

  it('bobbing between the two depths neither exits nor enters (no splash spam at the surface)', () => {
    expect(crossFluidSurface(1, contact(1, 0.2), ENTER, EXIT)).toEqual({ fluidId: 1, crossings: [] });
    expect(crossFluidSurface(0, contact(1, 0.2), ENTER, EXIT)).toEqual({ fluidId: 0, crossings: [] });
  });

  it('exits once it is shallower than the exit depth, or fully out', () => {
    expect(crossFluidSurface(1, contact(1, 0.05), ENTER, EXIT)).toEqual({ fluidId: 0, crossings: [{ kind: 'exit', fluidId: 1 }] });
    expect(crossFluidSurface(1, null, ENTER, EXIT)).toEqual({ fluidId: 0, crossings: [{ kind: 'exit', fluidId: 1 }] });
  });

  it('moving from one fluid into another is an exit and an enter', () => {
    expect(crossFluidSurface(1, contact(2, 0.8), ENTER, EXIT)).toEqual({
      fluidId: 2,
      crossings: [{ kind: 'exit', fluidId: 1 }, { kind: 'enter', fluidId: 2 }],
    });
  });

  it('leaving one fluid for a shallow bit of another is only an exit', () => {
    expect(crossFluidSurface(1, contact(2, 0.2), ENTER, EXIT)).toEqual({ fluidId: 0, crossings: [{ kind: 'exit', fluidId: 1 }] });
  });
});
