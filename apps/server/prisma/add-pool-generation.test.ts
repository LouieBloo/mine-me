import { describe, it, expect } from 'vitest';
import { validateFluidGeneration } from '@mine-me/shared';
import { needsPoolGeneration } from './add-pool-generation';
import { WATER_POOLS, WATER } from './add-water-and-lava';

describe('add-pool-generation', () => {
  it('only touches Water that exists and has no generation yet', () => {
    expect(needsPoolGeneration(null)).toBe(false);
    expect(needsPoolGeneration({ generation: null })).toBe(true);
    expect(needsPoolGeneration({ generation: undefined })).toBe(true);
    expect(needsPoolGeneration({ generation: { mode: 'POCKET', minDepth: 3, percentage: 1, minSize: 1, maxSize: 2 } })).toBe(false);
  });

  it('the pools are valid, in pool mode, at any depth, and a new Water has them too', () => {
    expect(validateFluidGeneration(WATER_POOLS)).toEqual([]);
    expect(WATER_POOLS.mode).toBe('POOL');
    expect(WATER_POOLS.maxDepth).toBeNull();
    expect(WATER.generation).toBe(WATER_POOLS);
  });
});
