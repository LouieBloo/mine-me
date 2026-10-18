import { describe, it, expect } from 'vitest';
import {
  GAS_CONCENTRATION_STEPS, GasField, GasGrid, GasRegistry, MiningPlayerBody, MiningTileType, dequantizeGasConcentration, quantizeGasConcentration,
  sampleGasContact, toGasWireCell, type GasEnvironment,
} from '../src/index';

describe('gas concentration quantisation', () => {
  it('maps empty to 0, full to the step count, and never rounds a visible gas to nothing', () => {
    expect(quantizeGasConcentration(0)).toBe(0);
    expect(quantizeGasConcentration(-1)).toBe(0);
    expect(quantizeGasConcentration(NaN)).toBe(0);
    expect(quantizeGasConcentration(1)).toBe(GAS_CONCENTRATION_STEPS);
    expect(quantizeGasConcentration(0.0001)).toBe(1);
    expect(quantizeGasConcentration(50)).toBe(GAS_CONCENTRATION_STEPS);
  });

  it('round-trips to within one step', () => {
    for (const c of [0.02, 0.3, 0.5, 0.77, 1]) {
      expect(Math.abs(dequantizeGasConcentration(quantizeGasConcentration(c)) - c)).toBeLessThanOrEqual(1 / GAS_CONCENTRATION_STEPS);
    }
  });

  it('builds wire cells, turning an invisible concentration into an empty cell', () => {
    expect(toGasWireCell(3, 4, 2, 1)).toEqual([3, 4, 2, 255]);
    expect(toGasWireCell(3, 4, 2, 0)).toEqual([3, 4, 0, 0]);
  });
});

describe('GasField', () => {
  it('starts empty and stores what it is told', () => {
    const field = new GasField(5, 4);
    expect(field.getGasId(1, 1)).toBe(0);
    expect(field.getConcentration(1, 1)).toBe(0);
    field.apply([[1, 1, 2, 51]]);
    expect(field.getGasId(1, 1)).toBe(2);
    expect(field.getConcentration(1, 1)).toBeCloseTo(0.2, 5);
  });

  it('reports only the cells that really changed', () => {
    const field = new GasField(5, 4);
    expect(field.apply([[1, 1, 2, 51], [2, 2, 1, 255]])).toHaveLength(2);
    expect(field.apply([[1, 1, 2, 51], [2, 2, 1, 100]])).toEqual([[2, 2, 1, 100]]);
  });

  it('empties a cell with a zero concentration, whatever gas id came with it', () => {
    const field = new GasField(3, 3);
    field.set(1, 1, 2, 80);
    expect(field.set(1, 1, 2, 0)).toBe(true);
    expect(field.getGasId(1, 1)).toBe(0);
    expect(field.set(1, 1, 2, 0)).toBe(false);
  });

  it('ignores cells outside the field and cells that are not whole numbers', () => {
    const field = new GasField(3, 3);
    expect(field.apply([[-1, 0, 1, 10], [3, 0, 1, 10], [0, 3, 1, 10], [0.5, 0, 1, 10]])).toEqual([]);
    expect(field.getGasId(-1, 0)).toBe(0);
    expect(field.getConcentration(9, 9)).toBe(0);
  });

  it('keeps the concentration within a byte', () => {
    const field = new GasField(2, 2);
    field.set(0, 0, 1, 9999);
    expect(field.getConcentration(0, 0)).toBe(1);
  });
});

describe('sampleGasContact', () => {
  const field = new GasField(6, 6);
  it('is null in clear air', () => {
    expect(sampleGasContact(field, 2.5, 2.5, 0.3, 0.45)).toBeNull();
  });

  it('reads a body that sits wholly in one cell by that cell\'s concentration', () => {
    field.set(2, 2, 3, 128);
    const contact = sampleGasContact(field, 2.5, 2.5, 0.3, 0.45)!;
    expect(contact.gasId).toBe(3);
    expect(contact.concentration).toBeCloseTo(128 / 255, 3);
  });

  it('weights each cell by how much of the body is in it', () => {
    const f = new GasField(6, 6);
    f.set(2, 2, 1, 255);
    // Body straddling cells (2,2) and (3,2): half in each, only one holds gas
    const contact = sampleGasContact(f, 3, 2.5, 0.5, 0.25)!;
    expect(contact.concentration).toBeCloseTo(0.5, 3);
  });

  it('picks the thickest gas when several touch the body', () => {
    const f = new GasField(6, 6);
    f.set(2, 2, 1, 60);
    f.set(3, 2, 2, 200);
    expect(sampleGasContact(f, 3, 2.5, 0.5, 0.25)!.gasId).toBe(2);
  });

  it('ignores a body with no size', () => {
    expect(sampleGasContact(field, 2.5, 2.5, 0, 0)).toBeNull();
  });
});

describe('a body in a gas', () => {
  const registry = new GasRegistry([{ typeKey: 'N', density: 1.15, diffusionRate: 0.25, minConcentration: 0.02, ventLifetime: 6 }]);
  const grid = Array.from({ length: 8 }, (_, y) => Array.from({ length: 8 }, (_, x) => ({ type: y === 7 || x === 0 || x === 7 ? MiningTileType.DIRT : MiningTileType.EMPTY })));
  const gasGrid = new GasGrid(8, 8, registry, (x, y) => y === 7 || x === 0 || x === 7);
  const environment: GasEnvironment = { sampler: gasGrid, propertiesOf: (id) => (id === 1 ? { density: 1.15 } : undefined) };

  it('knows nothing about gas until it is given an environment', () => {
    const body = new MiningPlayerBody({ x: 3.5, y: 6.4 });
    body.update(1 / 30, grid as any);
    expect(body.gasEnvironment).toBeNull();
    expect(body.gasContact).toBeNull();
  });

  it('reads the gas it stands in, and clear air once the gas is gone, with no effect on its movement', () => {
    // (the body is about two cells wide and nearly three tall, so the gas has to fill the cells around it)
    for (let x = 2; x <= 4; x++) for (let y = 5; y <= 6; y++) gasGrid.setCell(x, y, 1, 0.8);
    const body = new MiningPlayerBody({ x: 3.5, y: 6.4 });
    body.gasEnvironment = environment;
    body.update(1 / 30, grid as any);
    expect(body.gasContact?.gasId).toBe(1);
    expect(body.gasContact?.concentration).toBeGreaterThan(0.3);
    expect(body.movementFactor).toBe(1);
    for (let x = 2; x <= 4; x++) for (let y = 5; y <= 6; y++) gasGrid.setCell(x, y, 0, 0);
    body.update(1 / 30, grid as any);
    expect(body.gasContact).toBeNull();
  });
});
