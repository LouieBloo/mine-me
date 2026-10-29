import { describe, it, expect } from 'vitest';
import { DEFAULT_DOODAD_MAX_COUNT, validateDoodadSpawnRules } from '@mine-me/shared';
import { FIRST_DOODADS } from './add-first-doodads';
import { FIRST_DOODAD_GROUPS, GRASS_DENSITY, GRASS_KEY, OLD_DOODAD_MAX_COUNT, planGrassDensity, planGroups, planMaxCount } from './add-doodad-groups';

describe('add-doodad-groups', () => {
  it('names only doodads of the first set, with valid settings merged into their rules, and leaves bugs scattered', () => {
    const keys = FIRST_DOODADS.map((d) => d.key);
    for (const [key, groups] of Object.entries(FIRST_DOODAD_GROUPS)) {
      expect(keys, key).toContain(key);
      const own = FIRST_DOODADS.find((d) => d.key === key)!.spawn ?? {};
      expect(validateDoodadSpawnRules({ ...own, ...groups }), key).toEqual([]);
    }
    for (const d of FIRST_DOODADS) if (d.wander) expect(FIRST_DOODAD_GROUPS[d.key], d.key).toBeUndefined();
    expect(Object.keys(FIRST_DOODAD_GROUPS)).not.toContain('firefly');
    expect(Object.keys(FIRST_DOODAD_GROUPS)).not.toContain('cave_beetle');
  });

  it('sets groups where there are none, keeps a doodad that already groups, and keeps its other rules', () => {
    const plan = planGroups([{ key: 'icicle', spawn: { blocks: ['ICE'], minSpacing: 2 } }, { key: 'wall_moss', spawn: { groupChance: 0.2 } }], { icicle: { groupChance: 0.6 }, wall_moss: { groupChance: 0.7 }, nope: { groupChance: 1 } });
    expect(plan).toEqual([
      { key: 'icicle', action: 'set', spawn: { blocks: ['ICE'], minSpacing: 2, groupChance: 0.6 } },
      { key: 'wall_moss', action: 'keep', spawn: { groupChance: 0.2 } },
      { key: 'nope', action: 'missing' },
    ]);
    expect(planGroups([{ key: 'icicle', spawn: null }], { icicle: { groupChance: 0.6 } })[0]).toEqual({ key: 'icicle', action: 'set', spawn: { groupChance: 0.6 } });
  });

  it('knows the first seed\'s grass densities, so only an untouched link is changed', () => {
    const grass = FIRST_DOODADS.find((d) => d.key === GRASS_KEY)!;
    for (const [biomeKey, [old]] of Object.entries(GRASS_DENSITY)) expect(grass.links[biomeKey][1], biomeKey).toBe(old);
    const plan = planGrassDensity([{ biomeKey: 'default', density: 7.2 }, { biomeKey: 'clay_pits', density: 20 }]);
    expect(plan.map((p) => [p.biomeKey, p.action])).toEqual([['default', 'set'], ['clay_pits', 'keep'], ['gravel_banks', 'missing'], ['sandstone_hollows', 'missing']]);
    expect(plan[0].density).toBe(GRASS_DENSITY.default[1]);
  });

  it('makes the grassy biomes denser than the dry one', () => {
    expect(GRASS_DENSITY.default[1]).toBeGreaterThan(GRASS_DENSITY.gravel_banks[1]);
    expect(GRASS_DENSITY.gravel_banks[1]).toBeGreaterThan(GRASS_DENSITY.sandstone_hollows[1]);
  });

  it('moves only the old default cap to the new one', () => {
    expect(planMaxCount(OLD_DOODAD_MAX_COUNT)).toBe(DEFAULT_DOODAD_MAX_COUNT);
    expect(planMaxCount(900)).toBeNull();
    expect(planMaxCount(DEFAULT_DOODAD_MAX_COUNT)).toBeNull();
  });
});
