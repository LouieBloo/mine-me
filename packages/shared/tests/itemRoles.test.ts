import { describe, it, expect } from 'vitest';
import {
  ITEM_ROLE_WHERE,
  SOL_CURRENCY_SUBTYPE,
  findCurrencyItem,
  getItemRoles,
  isCurrencyItem,
  isLadderItem,
  isRangedWeaponItem,
  isThrowableItem,
  isTorchItem,
} from '../src';

const item = (over: Record<string, unknown> = {}): any => ({ id: 'x', name: 'Anything', type: 'MATERIAL', ...over });

describe('item roles come from category data, never from names', () => {
  it('recognises torches and ladders by subType (any case), whatever they are called', () => {
    expect(isTorchItem(item({ type: 'CONSUMABLE', subType: 'TORCH', name: 'Sunstone Brazier' }))).toBe(true);
    expect(isTorchItem(item({ subType: 'torch' }))).toBe(true);
    expect(isLadderItem(item({ type: 'CONSUMABLE', subType: 'LADDER', name: 'Rope' }))).toBe(true);
  });

  it('does NOT treat an item as a torch/ladder/dynamite because of its name', () => {
    expect(isTorchItem(item({ name: 'Torch', subType: 'OTHER' }))).toBe(false);
    expect(isLadderItem(item({ name: 'Rope Ladder', subType: 'OTHER' }))).toBe(false);
    expect(isThrowableItem(item({ name: 'Dynamite', subType: 'OTHER', throwable: false }))).toBe(false);
  });

  it('supports several kinds of one role', () => {
    const torches = [item({ subType: 'TORCH', name: 'Torch' }), item({ subType: 'TORCH', name: 'Bright Torch' })];
    expect(torches.every(isTorchItem)).toBe(true);
  });

  it('throwable means flagged throwable or dynamite', () => {
    expect(isThrowableItem(item({ throwable: true }))).toBe(true);
    expect(isThrowableItem(item({ subType: 'DYNAMITE' }))).toBe(true);
    expect(isThrowableItem(item({ subType: 'dynamite', throwable: false }))).toBe(true);
    expect(isThrowableItem(item({ throwable: false, subType: 'POTION' }))).toBe(false);
  });

  it('currency and ranged weapons', () => {
    expect(isCurrencyItem(item({ type: 'CURRENCY', subType: 'SOL' }))).toBe(true);
    expect(isCurrencyItem(item({ type: 'MATERIAL' }))).toBe(false);
    expect(isRangedWeaponItem(item({ shootsProjectiles: true }))).toBe(true);
    expect(isRangedWeaponItem(item({ shootsProjectiles: false }))).toBe(false);
  });

  it.each([null, undefined])('is false for %s', (v) => {
    expect(isTorchItem(v)).toBe(false);
    expect(isLadderItem(v)).toBe(false);
    expect(isThrowableItem(v)).toBe(false);
    expect(isCurrencyItem(v)).toBe(false);
    expect(getItemRoles(v)).toEqual([]);
  });

  it('copes with missing or non-string subTypes', () => {
    expect(isTorchItem(item({ subType: undefined }))).toBe(false);
    expect(isTorchItem(item({ subType: 5 }))).toBe(false);
  });

  it('lists all roles an item has', () => {
    expect(getItemRoles(item({ throwable: true, shootsProjectiles: true }))).toEqual(['THROWABLE', 'RANGED_WEAPON']);
    expect(getItemRoles(item({ type: 'CONSUMABLE', subType: 'TORCH' }))).toEqual(['TORCH']);
    expect(getItemRoles(item())).toEqual([]);
  });
});

describe('findCurrencyItem', () => {
  const items = [
    item({ id: 'ore', type: 'MATERIAL', subType: 'MINERAL' }),
    item({ id: 'lear', type: 'CURRENCY', subType: 'LEAR' }),
    item({ id: 'sol', type: 'CURRENCY', subType: 'SOL' }),
  ];

  it('finds the currency by subType regardless of its id or name', () => {
    expect(findCurrencyItem(items, SOL_CURRENCY_SUBTYPE)?.id).toBe('sol');
    expect(findCurrencyItem(items, 'lear')?.id).toBe('lear');
  });

  it('ignores non-currency items that share a subType, and returns undefined when absent', () => {
    expect(findCurrencyItem([item({ type: 'MATERIAL', subType: 'SOL' })], 'SOL')).toBeUndefined();
    expect(findCurrencyItem([], 'SOL')).toBeUndefined();
  });
});

describe('ITEM_ROLE_WHERE matches the helpers', () => {
  it('uses the same categories as the predicate functions', () => {
    expect(ITEM_ROLE_WHERE.torch.subType.equals).toBe('TORCH');
    expect(ITEM_ROLE_WHERE.ladder.subType.equals).toBe('LADDER');
    expect(ITEM_ROLE_WHERE.throwable.OR).toEqual([{ throwable: true }, { subType: { equals: 'DYNAMITE', mode: 'insensitive' } }]);
    // and none of them mention a name
    expect(JSON.stringify(ITEM_ROLE_WHERE)).not.toMatch(/name/i);
  });
});
