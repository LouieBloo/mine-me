import { describe, it, expect } from 'vitest';
import { TickPathBudget } from './BaseMobAI';

describe('TickPathBudget', () => {
  it('allows only `perTick` searches until reset', () => {
    const budget = new TickPathBudget(2);
    expect([budget.tryConsume(), budget.tryConsume(), budget.tryConsume()]).toEqual([true, true, false]);
    budget.reset();
    expect(budget.tryConsume()).toBe(true);
  });
});
