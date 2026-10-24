import { describe, it, expect } from 'vitest';
import { validateDoodad, isDoodadMotionPreset, doodadSizeChoices, BLOCK_SCALE } from '@mine-me/shared';
import fluids from '../../../packages/shared/src/data/fluids.json';
import gases from '../../../packages/shared/src/data/gases.json';
import { FIRST_DOODADS, asDefinition, doodadRow, planDoodads } from './add-first-doodads';
import { FIRST_BIOMES } from './add-first-biomes';
import { tileTypeForBlockKey } from '../src/services/mining/subsystems/MiningDataManager';

describe('add-first-doodads', () => {
  it('every doodad passes the same validation the admin enforces', () => {
    for (const d of FIRST_DOODADS) expect(validateDoodad(asDefinition(d)), d.key).toEqual([]);
  });

  it('has about a dozen unique keys, covering all four anchors and the behaviours', () => {
    expect(new Set(FIRST_DOODADS.map((d) => d.key)).size).toBe(FIRST_DOODADS.length);
    expect(FIRST_DOODADS.length).toBeGreaterThanOrEqual(10);
    expect(FIRST_DOODADS.length).toBeLessThanOrEqual(14);
    expect(new Set(FIRST_DOODADS.map((d) => d.anchor))).toEqual(new Set(['FLOOR', 'CEILING', 'WALL', 'AIR']));
    expect(FIRST_DOODADS.some((d) => d.motion?.preset === 'drip')).toBe(true);
    expect(FIRST_DOODADS.some((d) => d.wander?.mode === 'CRAWL')).toBe(true);
    expect(FIRST_DOODADS.some((d) => d.wander?.mode === 'FLUTTER' && d.light)).toBe(true);
    expect(FIRST_DOODADS.some((d) => d.reacts)).toBe(true);
    expect(FIRST_DOODADS.some((d) => d.light && d.motion?.preset === 'pulse')).toBe(true);
    expect(FIRST_DOODADS.some((d) => d.light && d.motion?.preset === 'flicker' && d.particleEffectName)).toBe(true);
  });

  it('names only motion presets, blocks, fluids, gases and biomes that exist', () => {
    const fluidKeys = fluids.map((f) => f.typeKey);
    const gasKeys = gases.map((g) => g.typeKey);
    const biomeKeys = FIRST_BIOMES.map((b) => b.key);
    for (const d of FIRST_DOODADS) {
      if (d.motion) expect(isDoodadMotionPreset(d.motion.preset), `${d.key} motion`).toBe(true);
      for (const key of d.spawn?.blocks ?? []) expect(tileTypeForBlockKey(key), `${d.key} block ${key}`).toBeDefined();
      for (const key of d.spawn?.nearFluids ?? []) expect(fluidKeys, `${d.key} fluid ${key}`).toContain(key);
      for (const key of d.spawn?.nearGases ?? []) expect(gasKeys, `${d.key} gas ${key}`).toContain(key);
      for (const key of Object.keys(d.links)) expect(biomeKeys, `${d.key} biome ${key}`).toContain(key);
    }
  });

  it('links every doodad to at least one biome, and every biome gets some scenery', () => {
    for (const d of FIRST_DOODADS) expect(Object.keys(d.links).length, d.key).toBeGreaterThan(0);
    for (const b of FIRST_BIOMES) expect(FIRST_DOODADS.some((d) => b.key in d.links), b.key).toBe(true);
    for (const d of FIRST_DOODADS) for (const [weight, density] of Object.values(d.links)) expect(weight > 0 && density > 0).toBe(true);
  });

  it('keeps a doodad where its biome and its spawn depth can meet, and sizes inside a sensible footprint', () => {
    for (const d of FIRST_DOODADS) {
      for (const size of doodadSizeChoices(asDefinition(d))) {
        expect(size.width).toBeGreaterThanOrEqual(1);
        expect(size.width).toBeLessThanOrEqual(4 * BLOCK_SCALE);
        expect(size.height).toBeLessThanOrEqual(4 * BLOCK_SCALE);
      }
      for (const key of Object.keys(d.links)) {
        const biome = FIRST_BIOMES.find((b) => b.key === key)!;
        const min = Math.max(biome.minDepth, d.spawn?.minDepth ?? 0);
        const max = Math.min(biome.maxDepth ?? Infinity, d.spawn?.maxDepth ?? Infinity);
        expect(min, `${d.key} in ${key}`).toBeLessThanOrEqual(max);
      }
    }
  });

  it('needs glowing, flickering and wandering doodads to be the ones that say so, and none have a picture yet', () => {
    for (const d of FIRST_DOODADS) {
      expect(doodadRow(d, null).textureUrl).toBeNull();
      if (d.light) expect(d.light.enabled).toBe(true);
    }
    expect(FIRST_DOODADS.find((d) => d.key === 'lava_vent')?.spawn?.nearFluids).toEqual(['LAVA']);
    expect(FIRST_DOODADS.find((d) => d.key === 'dripping_stalactite')?.spawn?.nearFluids).toEqual(['WATER']);
  });

  it('plans only the missing doodads', () => {
    expect(planDoodads([]).every((p) => p.action === 'create')).toBe(true);
    const plan = planDoodads(['firefly']);
    expect(plan.find((p) => p.doodad.key === 'firefly')?.action).toBe('skip');
    expect(plan.filter((p) => p.action === 'create')).toHaveLength(FIRST_DOODADS.length - 1);
  });

  it('builds a row with the particle effect it was given and null for what a doodad leaves out', () => {
    const vent = FIRST_DOODADS.find((d) => d.key === 'lava_vent')!;
    expect(doodadRow(vent, 'pe_1').particleEffectId).toBe('pe_1');
    expect(doodadRow(FIRST_DOODADS[0], null).particleEffectId).toBeNull();
  });
});
