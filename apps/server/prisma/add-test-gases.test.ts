import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { planGases, loadTestGasDefinitions } from './add-test-gases';

describe('add-test-gases', () => {
  it('creates both gases when the table is empty', () => {
    expect(planGases([])).toEqual([
      { typeKey: 'HYDROGEN', action: 'create' },
      { typeKey: 'NITROGEN', action: 'create' },
    ]);
  });

  it('skips a gas that exists, so admin edits are never overwritten', () => {
    expect(planGases([{ typeKey: 'HYDROGEN' }])).toEqual([
      { typeKey: 'HYDROGEN', action: 'skip' },
      { typeKey: 'NITROGEN', action: 'create' },
    ]);
    expect(planGases([{ typeKey: 'HYDROGEN' }, { typeKey: 'NITROGEN' }]).every((p) => p.action === 'skip')).toBe(true);
  });

  it('reads valid definitions from the dev mirror: hydrogen rises and burns, nitrogen sinks and is inert', () => {
    const [hydrogen, nitrogen] = loadTestGasDefinitions();
    expect(hydrogen.typeKey).toBe('HYDROGEN');
    expect(hydrogen.density).toBeLessThan(1);
    expect(hydrogen.flammability).toBeTruthy();
    expect(nitrogen.typeKey).toBe('NITROGEN');
    expect(nitrogen.density).toBeGreaterThan(1);
    expect(nitrogen.flammability ?? null).toBeNull();
  });

  it('refuses an invalid or incomplete mirror', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gas-'));
    const file = path.join(dir, 'gases.json');
    try {
      fs.writeFileSync(file, JSON.stringify([{ typeKey: 'HYDROGEN', name: 'Hydrogen' }]));
      expect(() => loadTestGasDefinitions(file)).toThrow(/invalid/);
      fs.writeFileSync(file, '[]');
      expect(() => loadTestGasDefinitions(file)).toThrow(/not found/);
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  });
});
