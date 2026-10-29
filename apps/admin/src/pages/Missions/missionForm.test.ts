import { describe, it, expect } from 'vitest';
import type { MissionDefinition } from '@mine-me/shared';
import { NEW_MISSION, formToMission, missionToForm, newObjective, newRewardItem, tierName } from './missionForm';

const mission: MissionDefinition = {
  id: 'm1', key: 'copper_run', name: 'Copper Run', description: null, minLevel: 1, maxLevel: 5, tier: 2, weight: 3,
  objectives: [{ type: 'KILL_MOB', amount: 3 }], rewardSol: 10, rewardXp: 20, rewardItems: [{ itemId: 'i1', chance: 50, minQuantity: 1, maxQuantity: 2 }],
};

describe('missionForm', () => {
  it('round-trips a mission through the form, an empty description becoming null', () => {
    const form = missionToForm(mission);
    expect(form.description).toBe('');
    expect(formToMission(form)).toMatchObject({ key: 'copper_run', description: null, tier: 2, weight: 3, objectives: [{ type: 'KILL_MOB', amount: 3 }], rewardItems: mission.rewardItems });
  });

  it('trims text, and sends an objective with no target without a targetId', () => {
    const body = formToMission({ ...NEW_MISSION, key: '  deep_dive ', name: ' Deep Dive ', objectives: [{ type: 'REACH_DEPTH', targetId: null, amount: 40 }, { type: 'MINE_ITEM', targetId: 'i1', amount: 5 }] });
    expect(body.key).toBe('deep_dive');
    expect(body.name).toBe('Deep Dive');
    expect(body.objectives).toEqual([{ type: 'REACH_DEPTH', amount: 40 }, { type: 'MINE_ITEM', targetId: 'i1', amount: 5 }]);
  });

  it('sends 0 for an empty reward number', () => {
    expect(formToMission({ ...NEW_MISSION, rewardSol: Number.NaN, rewardXp: Number.NaN })).toMatchObject({ rewardSol: 0, rewardXp: 0 });
  });

  it('gives a new objective the defaults of its type, with an empty target where one applies', () => {
    expect(newObjective('CLEAR_FLUID')).toEqual({ type: 'CLEAR_FLUID', targetId: null, amount: 30 });
    expect(newObjective('REACH_DEPTH')).toEqual({ type: 'REACH_DEPTH', targetId: undefined, amount: 45 });
    expect(newObjective('KILL_MOB').amount).toBe(3);
  });

  it('makes a reward item and names tiers', () => {
    expect(newRewardItem('i9')).toEqual({ itemId: 'i9', chance: 100, minQuantity: 1, maxQuantity: 1 });
    expect(tierName(1)).toBe('Tier 1 (easy)');
    expect(tierName(7)).toBe('Tier 7');
  });
});
