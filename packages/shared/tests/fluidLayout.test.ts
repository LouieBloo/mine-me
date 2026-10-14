import { describe, it, expect } from 'vitest';
import { FluidField, layoutFluidCell, quantizeFluidLevel } from '../src/index';

const q = quantizeFluidLevel;

describe('layoutFluidCell', () => {
  const field = new FluidField(5, 5);

  it('returns null for an empty cell', () => {
    expect(layoutFluidCell(field, 2, 2, 64)).toBeNull();
  });

  it('fills a partial cell from the bottom up to its level, with a surface', () => {
    field.set(2, 2, 1, q(0.5));
    expect(layoutFluidCell(field, 2, 2, 64)).toEqual({ x: 128, y: 2 * 64 + 32, width: 64, height: 32, fluidId: 1, surface: true });
  });

  it('draws a cell full when the same fluid is directly above it, with no surface', () => {
    field.set(1, 1, 1, q(0.2));
    field.set(1, 2, 1, q(0.2));
    expect(layoutFluidCell(field, 1, 2, 64)).toMatchObject({ y: 2 * 64, height: 64, surface: false });
    expect(layoutFluidCell(field, 1, 1, 64)).toMatchObject({ height: 13, surface: true });
  });

  it('does not treat a different fluid above as covering', () => {
    field.set(3, 1, 2, q(1));
    field.set(3, 2, 1, q(0.5));
    expect(layoutFluidCell(field, 3, 2, 64)).toMatchObject({ height: 32, surface: true });
  });

  it('caps a squeezed cell at one tile and keeps at least a pixel of a thin one', () => {
    field.set(4, 4, 1, q(1.04));
    expect(layoutFluidCell(field, 4, 4, 64)?.height).toBe(64);
    field.set(0, 4, 1, 1);
    expect(layoutFluidCell(field, 0, 4, 64)?.height).toBe(1);
  });
});
