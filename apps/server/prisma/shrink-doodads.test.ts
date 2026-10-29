import { describe, it, expect } from 'vitest';
import { validateDoodad, type DoodadDefinition } from '@mine-me/shared';
import { FIRST_DOODADS } from './add-first-doodads';
import { SMALLER_SIZES, planSizes } from './shrink-doodads';

describe('shrink-doodads', () => {
  it('only names doodads of the first set and gives every one a valid, smaller size', () => {
    for (const [key, size] of Object.entries(SMALLER_SIZES)) {
      const old = FIRST_DOODADS.find((d) => d.key === key);
      expect(old, key).toBeDefined();
      expect(validateDoodad({ ...old, width: size.width, height: size.height, sizeVariants: size.variants } as unknown as Partial<DoodadDefinition>), key).toEqual([]);
      expect(size.width * size.height, key).toBeLessThanOrEqual(old!.width * old!.height);
    }
  });

  it('keeps the seed in step with the new sizes', () => {
    for (const d of FIRST_DOODADS) {
      const size = SMALLER_SIZES[d.key];
      if (!size) continue;
      expect([d.width, d.height, d.sizeVariants ?? null], d.key).toEqual([size.width, size.height, size.variants]);
    }
  });

  it('changes a doodad at the old size, skips one already changed, and notes a missing one', () => {
    const plan = planSizes(
      [{ key: 'icicle', width: 1, height: 3, sizeVariants: null }, { key: 'wall_moss', width: 1, height: 2, sizeVariants: SMALLER_SIZES.wall_moss.variants }],
      { icicle: SMALLER_SIZES.icicle, wall_moss: SMALLER_SIZES.wall_moss, nope: SMALLER_SIZES.icicle }
    );
    expect(plan.map((p) => [p.key, p.action])).toEqual([['icicle', 'set'], ['wall_moss', 'skip'], ['nope', 'missing']]);
  });
});
