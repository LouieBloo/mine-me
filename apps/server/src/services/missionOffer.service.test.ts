import { describe, it, expect, beforeEach } from 'vitest';
import type { MissionDefinition } from '@mine-me/shared';
import { MISSION_OFFER_TTL_MS, MissionOfferService, levelFromXp, toOfferView } from './missionOffer.service';
import { MiningDataManager, type GameDefinitions } from './mining/subsystems/MiningDataManager';

const mission = (id: string, over: Partial<MissionDefinition> = {}): MissionDefinition => ({
  id, key: id, name: id, minLevel: 1, maxLevel: 5, tier: 1, weight: 1,
  objectives: [{ type: 'KILL_MOB', amount: 2 }], rewardCoins: 10, rewardXp: 5, rewardItems: [], ...over,
});

function dataWith(missions: MissionDefinition[]): MiningDataManager {
  const base = MiningDataManager.getInstance();
  const defs: GameDefinitions = { items: base.getItems(), mobs: base.getMobs(), blocks: [], missions };
  // A separate manager that holds only these missions; the shared one is left alone
  return new (MiningDataManager as any)(defs) as MiningDataManager;
}

describe('levelFromXp', () => {
  const levels = [{ level: 1, xpRequired: 0 }, { level: 2, xpRequired: 100 }, { level: 3, xpRequired: 300 }];
  it('is the highest level whose experience is reached', () => {
    expect(levelFromXp(levels, 0)).toBe(1);
    expect(levelFromXp(levels, 99)).toBe(1);
    expect(levelFromXp(levels, 100)).toBe(2);
    expect(levelFromXp(levels, 99999)).toBe(3);
  });
  it('is 1 with no levels configured', () => {
    expect(levelFromXp([], 50)).toBe(1);
  });
});

describe('MissionOfferService', () => {
  beforeEach(() => MissionOfferService.clear('c1'));
  const pool = Array.from({ length: 8 }, (_, i) => mission(`m${i}`));

  it('offers 2 to 4 missions that fit the level, and shows the same list when asked again', () => {
    const data = dataWith(pool);
    const first = MissionOfferService.offersFor('c1', 2, data);
    expect(first.length).toBeGreaterThanOrEqual(2);
    expect(first.length).toBeLessThanOrEqual(4);
    expect(MissionOfferService.offersFor('c1', 2, data).map((o) => o.id)).toEqual(first.map((o) => o.id));
  });

  it('offers nothing when no mission fits the level (the run starts without one)', () => {
    expect(MissionOfferService.offersFor('c1', 50, dataWith(pool))).toEqual([]);
    expect(MissionOfferService.hasOffers('c1')).toBe(false);
  });

  it('accepts a pick only from the offers, and uses the roll up', () => {
    const data = dataWith(pool);
    const offers = MissionOfferService.offersFor('c1', 2, data);
    const notOffered = pool.find((m) => !offers.some((o) => o.id === m.id))!; // a real mission that was simply not rolled
    expect(MissionOfferService.take('c1', notOffered.id, data)).toBeUndefined();
    expect(MissionOfferService.take('c1', 'not-a-mission', data)).toBeUndefined();
    const picked = MissionOfferService.take('c1', offers[0].id, data);
    expect(picked?.id).toBe(offers[0].id);
    expect(MissionOfferService.take('c1', offers[0].id, data)).toBeUndefined(); // used up
    expect(MissionOfferService.hasOffers('c1')).toBe(false);
  });

  it('refuses a pick when the character was never offered anything', () => {
    expect(MissionOfferService.take('c1', 'm0', dataWith(pool))).toBeUndefined();
  });

  it('drops an old roll and rolls again', () => {
    const data = dataWith(pool);
    const now = 1_000_000;
    MissionOfferService.offersFor('c1', 2, data, now);
    expect(MissionOfferService.take('c1', 'm0', data, now + MISSION_OFFER_TTL_MS + 1)).toBeUndefined();
    expect(MissionOfferService.offersFor('c1', 2, data, now + MISSION_OFFER_TTL_MS + 1).length).toBeGreaterThanOrEqual(2);
  });

  it('rolls again when an admin removed a mission from the kept roll', () => {
    const data = dataWith(pool);
    const first = MissionOfferService.offersFor('c1', 2, data);
    const smaller = dataWith(pool.filter((m) => m.id !== first[0].id));
    expect(MissionOfferService.offersFor('c1', 2, smaller).some((o) => o.id === first[0].id)).toBe(false);
  });

  it('describes a mission for the picker: written objectives and the reward', () => {
    const data = dataWith([mission('only', { objectives: [{ type: 'REACH_DEPTH', amount: 40 }, { type: 'KILL_MOB', amount: 3 }], rewardCoins: 99, rewardXp: 7 })]);
    const view = toOfferView(data.getMissions()[0], data);
    expect(view.objectives.map((o) => o.label)).toEqual(['Reach depth 40', 'Kill 3 mobs']);
    expect(view.reward).toMatchObject({ coins: 99, xp: 7 });
    expect(view.tier).toBe(1);
  });
});
