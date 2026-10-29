import { describe, it, expect } from 'vitest';
import type { MissionDefinition } from '../../types/mission';
import { missionsForLevel, rollMissionOffers, simulateOffers, validateMission, validateRewardItem } from './missionRules';
import type { MissionLookups } from './objectiveTypes';

const lookups: MissionLookups = {
  hasItem: (id) => id === 'copper' || id === 'gem',
  hasMob: (id) => id === 'mole',
  hasFluid: () => false,
  hasGas: () => false,
  nameOf: () => undefined,
};

const mission = (over: Partial<MissionDefinition> = {}): MissionDefinition => ({
  id: 'm1', key: 'copper_run', name: 'Copper Run', minLevel: 1, maxLevel: 5, tier: 1, weight: 1,
  objectives: [{ type: 'MINE_ITEM', targetId: 'copper', amount: 10 }], rewardSol: 10, rewardXp: 5, rewardItems: [], ...over,
});

describe('validateMission', () => {
  it('accepts a good mission', () => {
    expect(validateMission(mission(), lookups)).toEqual([]);
  });

  it('rejects a bad key, a missing name, bad levels, tier and weight', () => {
    const errors = validateMission(mission({ key: 'Bad Key', name: ' ', minLevel: 6, maxLevel: 5, tier: 0, weight: 0 }), lookups).join('|');
    for (const part of ['key must be', 'name is required', 'minimum level cannot be above', 'tier must be', 'weight must be']) expect(errors).toContain(part);
  });

  it('rejects an empty or too long objective list, and names the bad objective', () => {
    expect(validateMission(mission({ objectives: [] }), lookups).join()).toMatch(/at least one objective/);
    const many = Array.from({ length: 6 }, () => ({ type: 'REACH_DEPTH' as const, amount: 5 }));
    expect(validateMission(mission({ objectives: many }), lookups).join()).toMatch(/at most 5/);
    expect(validateMission(mission({ objectives: [{ type: 'MINE_ITEM', targetId: 'nope', amount: 1 }] }), lookups).join()).toMatch(/objective 1: .*unknown item/);
  });

  it('rejects negative rewards and bad reward items', () => {
    expect(validateMission(mission({ rewardSol: -1, rewardXp: 1.5 }), lookups).join()).toMatch(/Sol.*XP/);
    expect(validateMission(mission({ rewardItems: [{ itemId: 'nope', chance: 150, minQuantity: 0, maxQuantity: 0 }] }), lookups).join()).toMatch(/unknown item/);
  });
});

describe('validateRewardItem', () => {
  it('accepts a good item and rejects max below min', () => {
    expect(validateRewardItem({ itemId: 'gem', chance: 50, minQuantity: 1, maxQuantity: 3 }, lookups)).toEqual([]);
    expect(validateRewardItem({ itemId: 'gem', chance: 50, minQuantity: 3, maxQuantity: 1 }, lookups).join()).toMatch(/cannot be below/);
  });
});

describe('offers', () => {
  const pool = [mission({ id: 'a', minLevel: 1, maxLevel: 3 }), mission({ id: 'b', minLevel: 2, maxLevel: 6, weight: 3 }), mission({ id: 'c', minLevel: 5, maxLevel: 9 }), mission({ id: 'd', weight: 0 })];

  it('only offers missions whose level range contains the character and that have weight', () => {
    expect(missionsForLevel(pool, 2).map((m) => m.id)).toEqual(['a', 'b']);
    expect(missionsForLevel(pool, 5).map((m) => m.id)).toEqual(['b', 'c']);
    expect(missionsForLevel(pool, 99)).toEqual([]);
  });

  it('rolls distinct missions, 2 to 4, or all there are when fewer fit', () => {
    for (let i = 0; i < 50; i++) {
      const offers = rollMissionOffers(pool, 2, Math.random);
      expect(new Set(offers.map((m) => m.id)).size).toBe(offers.length);
      expect(offers.length).toBe(2); // only two fit
    }
    const big = Array.from({ length: 10 }, (_, i) => mission({ id: `m${i}` }));
    for (let i = 0; i < 50; i++) expect(rollMissionOffers(big, 1, Math.random).length).toBeGreaterThanOrEqual(2);
    for (let i = 0; i < 50; i++) expect(rollMissionOffers(big, 1, Math.random).length).toBeLessThanOrEqual(4);
  });

  it('is empty when nothing fits', () => {
    expect(rollMissionOffers(pool, 99)).toEqual([]);
  });

  it('is the same for the same random sequence', () => {
    const seq = () => { let n = 0; return () => ((n++ * 0.37) % 1); };
    const big = Array.from({ length: 8 }, (_, i) => mission({ id: `m${i}`, weight: i + 1 }));
    expect(rollMissionOffers(big, 1, seq()).map((m) => m.id)).toEqual(rollMissionOffers(big, 1, seq()).map((m) => m.id));
  });

  it('favours heavier missions', () => {
    const many = Array.from({ length: 12 }, (_, i) => mission({ id: `m${i}`, weight: i === 0 ? 20 : 1 }));
    let seed = 7;
    const rng = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const shares = simulateOffers(many, 1, 3000, rng);
    expect(shares.get(many[0]) ?? 0).toBeGreaterThan((shares.get(many[1]) ?? 0) * 2);
  });
});
