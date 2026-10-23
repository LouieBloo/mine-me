import { describe, it, expect } from 'vitest';
import { planWeights, proposeWeight } from './add-item-weights';

const item = (over: Partial<Parameters<typeof proposeWeight>[0]> = {}) => ({ name: 'Thing', itemKey: null, type: 'MATERIAL', subType: 'MINERAL', ...over });

describe('proposeWeight', () => {
  it('uses the item key first, then the lowercase name', () => {
    expect(proposeWeight(item({ itemKey: 'copperium' }))).toBe(3);
    expect(proposeWeight(item({ name: 'Solium' }))).toBe(5);
  });

  it('falls back to the subtype, and to 1 for an unknown subtype', () => {
    expect(proposeWeight(item())).toBe(4);
    expect(proposeWeight(item({ type: 'CONSUMABLE', subType: 'LADDER' }))).toBe(2);
    expect(proposeWeight(item({ subType: 'MYSTERY' }))).toBe(1);
  });

  it('gear and currency weigh nothing', () => {
    expect(proposeWeight(item({ type: 'GEAR', subType: 'WEAPON' }))).toBe(0);
    expect(proposeWeight(item({ type: 'CURRENCY', subType: 'SOL', itemKey: null, name: 'Sol2' }))).toBe(0);
  });
});

describe('planWeights', () => {
  it('only touches items still at 0 and never overwrites an admin-set weight', () => {
    const plan = planWeights([
      { ...item({ name: 'A' }), weight: 0 },
      { ...item({ name: 'B' }), weight: 9 },
      { ...item({ name: 'Sword', type: 'GEAR', subType: 'WEAPON' }), weight: 0 },
    ]);
    expect(plan).toEqual([{ name: 'A', from: 0, to: 4 }]);
  });
});
