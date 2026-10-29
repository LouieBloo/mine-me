import { describe, it, expect } from 'vitest';
import {
  DEFAULT_DOODAD_GROUP_FILL, DEFAULT_DOODAD_GROUP_SIZE_MAX, DEFAULT_DOODAD_GROUP_SIZE_MIN, DEFAULT_DOODAD_GROUP_SPREAD,
  doodadGroupMeanSize, groupFillChance, resolveDoodadGroups, splitGroupChance,
} from './doodadGroups';

describe('resolveDoodadGroups', () => {
  it('is null for a kind that does not group', () => {
    expect(resolveDoodadGroups(null)).toBeNull();
    expect(resolveDoodadGroups({})).toBeNull();
    expect(resolveDoodadGroups({ groupChance: 0, groupSizeMin: 5 })).toBeNull();
    expect(resolveDoodadGroups({ groupChance: null })).toBeNull();
  });

  it('fills in the defaults once there is a chance', () => {
    expect(resolveDoodadGroups({ groupChance: 0.5 })).toEqual({
      chance: 0.5, sizeMin: DEFAULT_DOODAD_GROUP_SIZE_MIN, sizeMax: DEFAULT_DOODAD_GROUP_SIZE_MAX, spread: DEFAULT_DOODAD_GROUP_SPREAD, fill: DEFAULT_DOODAD_GROUP_FILL, memberSpacing: 0,
    });
  });

  it('keeps what is set, keeps the max from falling under the min, and caps shares at 1', () => {
    expect(resolveDoodadGroups({ groupChance: 2, groupSizeMin: 12, groupFill: 3, groupSpread: 14, memberSpacing: 1 })).toEqual({ chance: 1, sizeMin: 12, sizeMax: 12, spread: 14, fill: 1, memberSpacing: 1 });
    expect(resolveDoodadGroups({ groupChance: 1, groupSizeMin: 10, groupSizeMax: 40 })).toMatchObject({ sizeMin: 10, sizeMax: 40 });
  });
});

describe('splitGroupChance', () => {
  it('expects the same amount as the plain scatter: lone ones plus a whole group per centre', () => {
    const groups = resolveDoodadGroups({ groupChance: 0.8, groupSizeMin: 4, groupSizeMax: 8 })!;
    const { single, centre } = splitGroupChance(0.1, groups);
    expect(doodadGroupMeanSize(groups)).toBe(6);
    expect(single + centre * doodadGroupMeanSize(groups)).toBeCloseTo(0.1, 10);
    expect(single).toBeCloseTo(0.02, 10);
  });

  it('is all lone ones at chance 0 and all centres at chance 1', () => {
    expect(splitGroupChance(0.1, { chance: 0, sizeMin: 2, sizeMax: 2, spread: 5, fill: 1, memberSpacing: 0 })).toEqual({ single: 0.1, centre: 0 });
    expect(splitGroupChance(0.1, { chance: 1, sizeMin: 2, sizeMax: 2, spread: 5, fill: 1, memberSpacing: 0 }).single).toBe(0);
  });
});

describe('groupFillChance', () => {
  const groups = { fill: 0.6, spread: 10 };
  it('is the fill at the centre and half of it at the edge', () => {
    expect(groupFillChance(groups, 0, 1)).toBeCloseTo(0.6, 10);
    expect(groupFillChance(groups, 10, 1)).toBeCloseTo(0.3, 10);
    expect(groupFillChance(groups, 30, 1)).toBeCloseTo(0.3, 10);
  });
  it('rises with the biome density but never over 1, and is 0 where there is none', () => {
    expect(groupFillChance(groups, 0, 4)).toBe(1);
    expect(groupFillChance(groups, 0, 2)).toBeGreaterThan(groupFillChance(groups, 0, 1));
    expect(groupFillChance(groups, 0, 0.25)).toBeLessThan(groupFillChance(groups, 0, 1));
    expect(groupFillChance(groups, 0, 0)).toBe(0);
  });
  it('copes with a spread of 0', () => {
    expect(groupFillChance({ fill: 0.5, spread: 0 }, 0, 1)).toBe(0.5);
  });
});
