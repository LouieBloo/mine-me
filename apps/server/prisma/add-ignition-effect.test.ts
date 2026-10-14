import { describe, it, expect } from 'vitest';
import { planIgnition, IGNITING_ITEM_NAMES } from './add-ignition-effect';

const dynamite = { id: 'i1', name: 'Dynamite', hasIgnitesEffect: false };
const pickaxe = { id: 'i2', name: 'Flame Pickaxe', hasIgnitesEffect: false };
const torch = { id: 'i3', name: 'Torch', hasIgnitesEffect: false };

describe('add-ignition-effect', () => {
  it('creates the effect when it does not exist, and not when it does', () => {
    expect(planIgnition(false, []).createEffect).toBe(true);
    expect(planIgnition(true, []).createEffect).toBe(false);
  });

  it('attaches it to each wanted item that exists and lacks it', () => {
    const plan = planIgnition(false, [dynamite, pickaxe, torch]);
    expect(plan.items).toEqual([
      { name: 'Dynamite', itemId: 'i1', action: 'attach' },
      { name: 'Flame Pickaxe', itemId: 'i2', action: 'attach' },
      { name: 'Torch', itemId: 'i3', action: 'attach' },
    ]);
  });

  it('leaves alone an item that already ignites (the owner may have tuned it)', () => {
    const plan = planIgnition(true, [{ ...dynamite, hasIgnitesEffect: true }, pickaxe]);
    expect(plan.items.map((i) => i.action)).toEqual(['skip-has-effect', 'attach', 'skip-missing']);
  });

  it('skips items that are not in the database', () => {
    const plan = planIgnition(true, [dynamite]);
    expect(plan.items[1]).toEqual({ name: 'Flame Pickaxe', action: 'skip-missing' });
    expect(plan.items[2]).toEqual({ name: 'Torch', action: 'skip-missing' });
  });

  it('only ever touches the listed items', () => {
    const plan = planIgnition(true, [dynamite, pickaxe, { id: 'x', name: 'Basic Pickaxe', hasIgnitesEffect: false }]);
    expect(plan.items.map((i) => i.name)).toEqual(IGNITING_ITEM_NAMES);
  });
});
