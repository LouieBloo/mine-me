import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { planOil, loadOilDefinition, OIL_TYPE_KEY } from './add-oil-fluid';

describe('add-oil-fluid', () => {
  it('creates Oil when no fluid has its key', () => {
    expect(planOil([])).toEqual({ action: 'create' });
    expect(planOil([{ typeKey: 'WATER', generation: null }])).toEqual({ action: 'create' });
  });

  it('gives an existing Oil its generation settings only if it has none', () => {
    expect(planOil([{ typeKey: OIL_TYPE_KEY, generation: null }])).toEqual({ action: 'add-generation' });
    expect(planOil([{ typeKey: OIL_TYPE_KEY }])).toEqual({ action: 'add-generation' });
    expect(planOil([{ typeKey: OIL_TYPE_KEY, generation: { minDepth: 3 } }])).toEqual({ action: 'skip' });
  });

  it('reads a valid, burning, thick Oil from the dev mirror', () => {
    const oil = loadOilDefinition();
    expect(oil).toMatchObject({ typeKey: 'OIL', color: '#0b0b0d' });
    expect(oil.flammability).toBeTruthy();
    expect(oil.viscosity).toBeGreaterThan(0.5);
    expect(oil.generation).toMatchObject({ minDepth: 8, percentage: 1.5 });
  });

  it('refuses an invalid mirror', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oil-'));
    const file = path.join(dir, 'fluids.json');
    fs.writeFileSync(file, JSON.stringify([{ typeKey: 'OIL', name: 'Oil' }]));
    try {
      expect(() => loadOilDefinition(file)).toThrow(/invalid/);
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  });
});
