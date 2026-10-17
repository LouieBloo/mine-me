import { describe, it, expect } from 'vitest';
import { FLUID_LEVEL_STEPS, FluidField, dequantizeFluidLevel, quantizeFluidLevel, toFluidWireCell } from '../src/index';

describe('fluid level quantisation', () => {
  it('maps empty to 0, full to the step count, and never rounds a visible level to nothing', () => {
    expect(quantizeFluidLevel(0)).toBe(0);
    expect(quantizeFluidLevel(-1)).toBe(0);
    expect(quantizeFluidLevel(NaN)).toBe(0);
    expect(quantizeFluidLevel(1)).toBe(FLUID_LEVEL_STEPS);
    expect(quantizeFluidLevel(0.001)).toBe(1);
  });

  it('is whole units, 16 to a cell, and never more than a full cell', () => {
    expect(FLUID_LEVEL_STEPS).toBe(16);
    expect(quantizeFluidLevel(0.5)).toBe(8);
    expect(quantizeFluidLevel(1.05)).toBe(16);
    expect(quantizeFluidLevel(50)).toBe(16);
  });

  it('round-trips to within one step', () => {
    for (const level of [0.05, 0.3, 0.5, 0.77, 1]) {
      expect(Math.abs(dequantizeFluidLevel(quantizeFluidLevel(level)) - level)).toBeLessThanOrEqual(1 / FLUID_LEVEL_STEPS);
    }
  });

  it('builds wire cells, turning an invisible level into an empty cell', () => {
    expect(toFluidWireCell(3, 4, 2, 0.5)).toEqual([3, 4, 2, 8]);
    expect(toFluidWireCell(3, 4, 2, 0)).toEqual([3, 4, 0, 0]);
  });
});

describe('FluidField', () => {
  it('starts empty and stores what it is told', () => {
    const field = new FluidField(5, 4);
    expect(field.getFluidId(1, 1)).toBe(0);
    expect(field.getLevel(1, 1)).toBe(0);
    field.apply([[1, 1, 2, 8]]);
    expect(field.getFluidId(1, 1)).toBe(2);
    expect(field.getLevel(1, 1)).toBeCloseTo(0.5, 5);
  });

  it('reports only the cells that really changed', () => {
    const field = new FluidField(5, 4);
    expect(field.apply([[1, 1, 1, 4], [2, 2, 1, 8]])).toHaveLength(2);
    expect(field.apply([[1, 1, 1, 4], [2, 2, 1, 9]])).toEqual([[2, 2, 1, 9]]);
  });

  it('empties a cell when told level 0, whatever fluid id comes with it', () => {
    const field = new FluidField(3, 3);
    field.apply([[1, 1, 1, 12]]);
    field.apply([[1, 1, 1, 0]]);
    expect(field.getFluidId(1, 1)).toBe(0);
    expect(field.getLevel(1, 1)).toBe(0);
  });

  it('ignores cells outside the field and non-integer positions', () => {
    const field = new FluidField(3, 3);
    expect(field.apply([[-1, 0, 1, 5], [3, 0, 1, 5], [0, 3, 1, 5], [0.5, 0, 1, 5]])).toEqual([]);
    expect(field.getLevel(-1, 0)).toBe(0);
    expect(field.getFluidId(9, 9)).toBe(0);
  });
});
