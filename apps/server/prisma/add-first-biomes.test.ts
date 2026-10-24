import { describe, it, expect } from 'vitest';
import { validateBiome, BLOCK_SCALE } from '@mine-me/shared';
import fluids from '../../../packages/shared/src/data/fluids.json';
import gases from '../../../packages/shared/src/data/gases.json';
import { FIRST_BIOMES, planBiomes, biomeRow } from './add-first-biomes';
import { tileTypeForBlockKey } from '../src/services/mining/subsystems/MiningDataManager';

const blockKeys = (b: (typeof FIRST_BIOMES)[number]) => [
  ...Object.keys(b.blockPalette?.weights ?? {}),
  ...(b.blockPalette?.swaps ?? []).flatMap((s) => [s.from, s.to]),
];

describe('add-first-biomes', () => {
  it('every biome passes the same validation the admin enforces', () => {
    for (const b of FIRST_BIOMES) expect(validateBiome(b), b.key).toEqual([]);
  });

  it('has unique keys and exactly one default', () => {
    expect(new Set(FIRST_BIOMES.map((b) => b.key)).size).toBe(FIRST_BIOMES.length);
    expect(FIRST_BIOMES.filter((b) => b.isDefault)).toHaveLength(1);
  });

  it('names only blocks, fluids and gases that exist', () => {
    const fluidKeys = fluids.map((f) => f.typeKey);
    const gasKeys = gases.map((g) => g.typeKey);
    for (const b of FIRST_BIOMES) {
      for (const key of blockKeys(b)) expect(tileTypeForBlockKey(key), `${b.key}: ${key}`).toBeDefined();
      for (const key of Object.keys(b.fluidWeights ?? {})) expect(fluidKeys, `${b.key}: ${key}`).toContain(key);
      for (const key of Object.keys(b.gasWeights ?? {})) expect(gasKeys, `${b.key}: ${key}`).toContain(key);
    }
  });

  it('keeps every depth window inside the 135-row mine, and every non-default biome has a tint', () => {
    for (const b of FIRST_BIOMES) {
      expect(b.minDepth).toBeLessThan(45 * BLOCK_SCALE);
      if (b.maxDepth != null) expect(b.maxDepth).toBeLessThanOrEqual(45 * BLOCK_SCALE);
      if (!b.isDefault) expect(b.ambient?.tint, b.key).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('plans only the missing biomes', () => {
    expect(planBiomes([]).every((p) => p.action === 'create')).toBe(true);
    const plan = planBiomes(['clay_pits']);
    expect(plan.find((p) => p.biome.key === 'clay_pits')?.action).toBe('skip');
    expect(plan.filter((p) => p.action === 'create')).toHaveLength(FIRST_BIOMES.length - 1);
  });

  it('builds a row with a null JSON column for each thing a biome leaves out', () => {
    const row = biomeRow(FIRST_BIOMES[0]);
    expect(row.key).toBe('default');
    expect(row.maxDepth).toBeNull();
  });
});
