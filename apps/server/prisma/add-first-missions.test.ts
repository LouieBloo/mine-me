import { describe, it, expect } from 'vitest';
import { validateMission, OBJECTIVE_TYPES, type MissionLookups, type ObjectiveType } from '@mine-me/shared';
import { FIRST_MISSIONS, planMissions, resolveMission, type Catalog } from './add-first-missions';

const catalog: Catalog = {
  items: new Map([['Copperium', 'i-cu'], ['Silverium', 'i-ag']]),
  mobs: new Map([['Mole Person', 'm-mole']]),
  fluids: new Map([['OIL', 'f-oil']]),
  gases: new Map([['HYDROGEN', 'g-h2']]),
};
const idsOf = (m: ReadonlyMap<string, string>) => new Set(m.values());
const lookups: MissionLookups = {
  hasItem: (id) => idsOf(catalog.items).has(id),
  hasMob: (id) => idsOf(catalog.mobs).has(id),
  hasFluid: (id) => idsOf(catalog.fluids).has(id),
  hasGas: (id) => idsOf(catalog.gases).has(id),
  nameOf: () => undefined,
  itemIsMineable: (id) => id === 'i-cu' || id === 'i-ag',
};

describe('add-first-missions', () => {
  it('has unique keys, covers every available objective type and three tiers', () => {
    const keys = FIRST_MISSIONS.map((m) => m.key);
    expect(new Set(keys).size).toBe(keys.length);
    const types = new Set<ObjectiveType>(FIRST_MISSIONS.flatMap((m) => m.objectives.map((o) => o.type)));
    for (const t of Object.values(OBJECTIVE_TYPES).filter((d) => d.available).map((d) => d.type)) expect(types.has(t), t).toBe(true);
    expect(new Set(FIRST_MISSIONS.map((m) => m.tier))).toEqual(new Set([1, 2, 3]));
  });

  it('makes every template into a valid mission when the database has the targets', () => {
    const plan = planMissions([], catalog, lookups);
    expect(plan.map((p) => `${p.mission.key}:${p.action}:${p.notes.join()}`).filter((s) => !s.includes(':create:'))).toEqual([]);
    for (const p of plan) expect(validateMission(p.row as never, lookups), p.mission.key).toEqual([]);
  });

  it('grows with the tier: more objectives and a bigger reward', () => {
    const byTier = (t: number) => FIRST_MISSIONS.filter((m) => m.tier === t);
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(avg(byTier(3).map((m) => m.objectives.length))).toBeGreaterThan(avg(byTier(1).map((m) => m.objectives.length)));
    expect(avg(byTier(3).map((m) => m.rewardSol))).toBeGreaterThan(avg(byTier(2).map((m) => m.rewardSol)));
    expect(avg(byTier(2).map((m) => m.rewardSol))).toBeGreaterThan(avg(byTier(1).map((m) => m.rewardSol)));
  });

  it('skips missions that exist and reports what the database lacks', () => {
    const plan = planMissions(['first_copper'], { ...catalog, mobs: new Map() }, lookups);
    expect(plan.find((p) => p.mission.key === 'first_copper')?.action).toBe('skip');
    const mole = plan.find((p) => p.mission.key === 'mole_trouble')!;
    expect(mole.action).toBe('problem');
    expect(mole.notes.join()).toMatch(/Mole Person/);
  });

  it('resolves names to ids in objectives and reward items', () => {
    const resolved = resolveMission(FIRST_MISSIONS.find((m) => m.key === 'silver_vein')!, catalog);
    expect('row' in resolved && resolved.row.objectives).toEqual([{ type: 'MINE_ITEM', targetId: 'i-ag', amount: 8 }, { type: 'REACH_DEPTH', amount: 60 }]);
    expect('row' in resolved && resolved.row.rewardItems[0]).toMatchObject({ itemId: 'i-cu' });
  });
});
