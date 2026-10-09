import { describe, it, expect } from 'vitest';
import {
  CharacterModEngine,
  DEFAULT_MELEE_KNOCKBACK,
  KNOCKBACK_LIFT_RATIO,
  canBreakBlock,
  getItemKnockbackEffect,
  getItemPickPowerEffect,
  getItemToolDamageEffect,
  knockbackImpulse,
  sumItemEffect,
} from '../src';

const item = (...effects: Array<[string, number]>): any => ({
  type: 'GEAR',
  itemEffects: effects.map(([flag, value]) => ({ value, effect: { [flag]: true } })),
});

describe('effect-derived combat stats', () => {
  it('sums each stat from its own effect flag only', () => {
    const it = item(['toolDamageModifier', 30], ['damageModifier', 12], ['pickPowerModifier', 2], ['knockbackModifier', 60], ['miningSpeedModifier', 25]);
    expect(getItemToolDamageEffect(it)).toBe(30);
    expect(sumItemEffect(it, 'damageModifier')).toBe(12);
    expect(getItemPickPowerEffect(it)).toBe(2);
    expect(getItemKnockbackEffect(it)).toBe(60);
    expect(sumItemEffect(it, 'miningSpeedModifier')).toBe(25);
  });

  it('adds up several effects of the same kind on one item', () => {
    expect(getItemPickPowerEffect(item(['pickPowerModifier', 1], ['pickPowerModifier', 2]))).toBe(3);
  });

  it('is 0 for missing items, items without effects, or effects of other kinds', () => {
    expect(getItemPickPowerEffect(null)).toBe(0);
    expect(getItemPickPowerEffect(undefined)).toBe(0);
    expect(getItemPickPowerEffect({ itemEffects: undefined } as any)).toBe(0);
    expect(getItemPickPowerEffect(item(['damageModifier', 50]))).toBe(0);
  });

  it('ignores effects with no value', () => {
    expect(getItemKnockbackEffect({ itemEffects: [{ effect: { knockbackModifier: true } }] } as any)).toBe(0);
  });
});

describe('CharacterModEngine stats from equipped gear', () => {
  it('aggregates every stat over equipped gear only', () => {
    const pick = { equipped: true, item: item(['toolDamageModifier', 25], ['damageModifier', 20], ['pickPowerModifier', 1], ['miningSpeedModifier', 25]) };
    const gloves = { equipped: true, item: item(['pickPowerModifier', 1], ['knockbackModifier', 10]) };
    const spare = { equipped: false, item: item(['pickPowerModifier', 9], ['toolDamageModifier', 99]) };
    const mods = CharacterModEngine.getModifications([pick, gloves, spare]);
    expect(mods).toMatchObject({ toolDamage: 25, weaponDamage: 20, pickPower: 2, knockback: 10, miningSpeed: 25 });
  });
});

describe('knockbackImpulse', () => {
  it('uses the default push (4.5 sideways, 3.2 up) when there is no knockback stat', () => {
    expect(DEFAULT_MELEE_KNOCKBACK).toBe(45);
    const k = knockbackImpulse(0, 1);
    expect(k.x).toBeCloseTo(4.5);
    expect(k.y).toBeCloseTo(-3.2);
    expect(knockbackImpulse(-3, 1)).toEqual(k);
  });

  it('scales with the stat (tenths of tiles/s) and flips with direction', () => {
    const k = knockbackImpulse(90, -1);
    expect(k.x).toBeCloseTo(-9);
    expect(k.y).toBeCloseTo(-9 * KNOCKBACK_LIFT_RATIO);
  });
});

describe('canBreakBlock', () => {
  it('requires pick power to meet the block requirement', () => {
    expect(canBreakBlock(0, 0)).toBe(true);
    expect(canBreakBlock(1, 2)).toBe(false);
    expect(canBreakBlock(2, 2)).toBe(true);
    expect(canBreakBlock(5, 2)).toBe(true);
  });

  it('treats a missing requirement as 0', () => {
    expect(canBreakBlock(0, undefined)).toBe(true);
    expect(canBreakBlock(0, null)).toBe(true);
  });
});
