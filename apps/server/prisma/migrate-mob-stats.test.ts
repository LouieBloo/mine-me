import { describe, it, expect } from 'vitest';
import { planMobStatMigration } from './migrate-mob-stats';

const mob = (over: Record<string, unknown> = {}) => ({ id: 'id', name: 'Mob', miningSpeed: 50, aiConfig: null, ...over }) as any;

describe('planMobStatMigration', () => {
  it('turns a legacy multiplier into a percentage', () => {
    const [p] = planMobStatMigration([mob({ miningSpeed: 0.25 })]);
    expect(p.miningSpeed).toBe(25);
  });
  it('leaves percentages and zero (cannot mine) alone', () => {
    expect(planMobStatMigration([mob({ miningSpeed: 50 }), mob({ miningSpeed: 0 }), mob({ miningSpeed: 10.5 })])).toEqual([]);
  });
  it('renames detectionRadius to aggroRange and keeps other keys', () => {
    const [p] = planMobStatMigration([mob({ aiConfig: { detectionRadius: 12, mineRange: 1.1 } })]);
    expect(p.aiConfig).toEqual({ mineRange: 1.1, aggroRange: 12 });
  });
  it('does not overwrite an existing aggroRange', () => {
    const [p] = planMobStatMigration([mob({ aiConfig: { detectionRadius: 12, aggroRange: 5 } })]);
    expect(p.aiConfig).toEqual({ aggroRange: 5 });
  });
  it('is idempotent: applying the plan then planning again yields nothing', () => {
    const before = mob({ miningSpeed: 0.25, aiConfig: { detectionRadius: 12 } });
    const [p] = planMobStatMigration([before]);
    const after = { ...before, miningSpeed: p.miningSpeed, aiConfig: p.aiConfig };
    expect(planMobStatMigration([after])).toEqual([]);
  });
});
