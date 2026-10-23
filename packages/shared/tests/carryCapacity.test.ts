import { describe, it, expect } from 'vitest';
import { BASE_CARRY_CAPACITY, backpackWeight, canCarry, carryCapacityOfInventory, carryRoom, deriveCarryCapacity } from '../src';

const bag = (value: number) => [{ value, effect: { carryCapacityModifier: true } }];
const defs = new Map([['dirt', { weight: 1 }], ['ore', { weight: 4 }], ['feather', { weight: 0 }]]);

describe('deriveCarryCapacity', () => {
  it('is the base with no effects', () => {
    expect(deriveCarryCapacity()).toBe(BASE_CARRY_CAPACITY);
    expect(deriveCarryCapacity(null, undefined, [])).toBe(BASE_CARRY_CAPACITY);
  });

  it('adds Carry Capacity effects from every list and ignores other effects', () => {
    const other = [{ value: 50, effect: { damageModifier: true } }];
    expect(deriveCarryCapacity(bag(40), bag(10), other)).toBe(BASE_CARRY_CAPACITY + 50);
  });

  it('never goes below 0', () => {
    expect(deriveCarryCapacity(bag(-500))).toBe(0);
  });
});

describe('carryCapacityOfInventory', () => {
  it('counts equipped items only', () => {
    const equipped = { equipped: true, item: { itemEffects: bag(30) } } as any;
    const spare = { equipped: false, item: { itemEffects: bag(999) } } as any;
    expect(carryCapacityOfInventory([equipped, spare])).toBe(BASE_CARRY_CAPACITY + 30);
  });
});

describe('backpackWeight / canCarry', () => {
  const pack = [{ itemId: 'dirt', quantity: 10 }, { itemId: 'ore', quantity: 5 }];

  it('sums weight times quantity; unknown and weightless items weigh nothing', () => {
    expect(backpackWeight(pack, defs)).toBe(30);
    expect(backpackWeight([{ itemId: 'ghost', quantity: 9 }, { itemId: 'feather', quantity: 9 }], defs)).toBe(0);
    expect(backpackWeight(pack, { dirt: { weight: 2 }, ore: { weight: 0 } })).toBe(20);
  });

  it('carryRoom floors to whole units', () => {
    expect(carryRoom(pack, 'ore', 40, defs)).toBe(2);
    expect(carryRoom(pack, 'dirt', 40, defs)).toBe(10);
    expect(carryRoom(pack, 'dirt', 30, defs)).toBe(0);
    expect(carryRoom(pack, 'dirt', 10, defs)).toBe(0);
    expect(carryRoom(pack, 'feather', 0, defs)).toBe(Infinity);
  });

  it('allows exactly up to capacity, not past it', () => {
    expect(canCarry(pack, 'ore', 2, 38, defs)).toBe(true);
    expect(canCarry(pack, 'ore', 3, 38, defs)).toBe(false);
    expect(canCarry(pack, 'feather', 1000, 0, defs)).toBe(true);
    expect(canCarry(pack, 'ore', 0, 0, defs)).toBe(true);
  });
});
