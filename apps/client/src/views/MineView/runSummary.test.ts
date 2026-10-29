import { describe, it, expect } from 'vitest';
import type { MissionResultView } from '@mine-me/shared';
import { buildRunSummary } from './runSummary';

const loot = [
  { itemId: 'copper', itemName: 'Copperium', iconUrl: null, quantity: 3 },
  { itemId: 'copper', itemName: 'Copperium', iconUrl: null, quantity: 1 },
  { itemId: 'gem', itemName: 'Gem', iconUrl: null, quantity: 2 },
] as never;

const mission = (over: Partial<MissionResultView> = {}): MissionResultView => ({
  name: 'Run', tier: 1, outcome: 'paid', objectives: [], contributions: [],
  reward: { sol: 40, xp: 25, items: [{ itemId: 'copper', itemName: 'Copperium', quantity: 2 }, { itemId: 'ring', itemName: 'Ring', quantity: 1 }] },
  ...over,
});

describe('the Expedition Summary totals', () => {
  it('groups the loot and counts the XP estimate, with no Sol, when there is no mission', () => {
    const s = buildRunSummary(loot, null);
    expect(s.sol).toBe(0);
    expect(s.experience).toBe(6 * 5);
    expect(s.items.map((i) => [i.itemId, i.quantity])).toEqual([['copper', 4], ['gem', 2]]);
  });

  it('adds the mission\'s Sol, XP and items once to the loot', () => {
    const s = buildRunSummary(loot, mission());
    expect(s.sol).toBe(40);
    expect(s.experience).toBe(6 * 5 + 25);
    expect(s.items.map((i) => [i.itemId, i.quantity])).toEqual([['copper', 6], ['gem', 2], ['ring', 1]]);
  });

  it('adds nothing for a mission that paid nothing', () => {
    const s = buildRunSummary(loot, mission({ outcome: 'unfinished', reward: undefined }));
    expect(s.sol).toBe(0);
    expect(s.experience).toBe(6 * 5);
    expect(s.items).toHaveLength(2);
  });

  it('is empty for a lost run with no loot', () => {
    expect(buildRunSummary([], mission({ outcome: 'failed', reward: undefined }))).toEqual({ sol: 0, experience: 0, items: [] });
  });
});
