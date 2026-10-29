import { describe, it, expect } from 'vitest';
import type { ObjectiveDefinition } from '@mine-me/shared';
import { FIRST_MISSIONS } from './add-first-missions';
import { planConversion } from './convert-mission-clear-cells';

const clear = (type: 'CLEAR_FLUID' | 'CLEAR_GAS', amount: number): ObjectiveDefinition => ({ type, targetId: 't', amount });

describe('convert-mission-clear-cells', () => {
  it('sets the starter missions\' clear objectives to the seeded cell counts and leaves other objectives alone', () => {
    const gas = FIRST_MISSIONS.find((m) => m.key === 'clear_the_air')!.objectives[0].amount;
    const plan = planConversion([{ key: 'clear_the_air', objectives: [clear('CLEAR_GAS', 50)] }]);
    expect(plan).toHaveLength(1);
    expect(plan[0]).toMatchObject({ key: 'clear_the_air', action: 'set' });
    expect(plan[0].objectives).toEqual([clear('CLEAR_GAS', gas)]);
  });

  it('is idempotent: a mission already in cells is kept', () => {
    const oil = FIRST_MISSIONS.find((m) => m.key === 'burn_the_oil')!.objectives[0].amount;
    expect(planConversion([{ key: 'burn_the_oil', objectives: [clear('CLEAR_FLUID', oil)] }])[0].action).toBe('keep');
  });

  it('skips missions without a clear objective, and reports admin-made ones without changing them', () => {
    const plan = planConversion([
      { key: 'first_copper', objectives: [{ type: 'MINE_ITEM', targetId: 'i', amount: 10 }] },
      { key: 'my_mission', objectives: [clear('CLEAR_FLUID', 60)] },
    ]);
    expect(plan.map((p) => [p.key, p.action])).toEqual([['my_mission', 'manual']]);
    expect(plan[0].objectives).toBeUndefined();
  });

  it('seeds clear objectives as cell counts a map can hold', () => {
    for (const m of FIRST_MISSIONS) for (const o of m.objectives) if (o.type === 'CLEAR_FLUID' || o.type === 'CLEAR_GAS') expect(o.amount).toBeLessThanOrEqual(1000);
  });
});
