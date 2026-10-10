import { describe, it, expect } from 'vitest';
import { advanceSwing, deriveCombatStats, swingsPerSecond, sumEffects, type SwingState } from '../src';

const entry = (flag: string, value: number) => ({ value, effect: { [flag]: true } });

describe('deriveCombatStats', () => {
  it('sums each stat from its own effect flag across all lists', () => {
    const gear = [entry('miningSpeedModifier', 25), entry('toolDamageModifier', 20)];
    const mob = [entry('damageModifier', 6), entry('toolDamageModifier', 5), entry('pickPowerModifier', 2), entry('knockbackModifier', 30)];
    expect(deriveCombatStats(gear, mob)).toEqual({
      miningSpeed: 25,
      toolDamage: 25,
      weaponDamage: 6,
      pickPower: 2,
      knockback: 30,
    });
  });

  it('is all zeros for entities with no effects (null/undefined lists included)', () => {
    expect(deriveCombatStats()).toEqual({ miningSpeed: 0, toolDamage: 0, weaponDamage: 0, pickPower: 0, knockback: 0 });
    expect(deriveCombatStats(null, undefined, [])).toEqual(deriveCombatStats());
  });

  it('ignores entries without the flag and tolerates null values', () => {
    expect(sumEffects([{ value: 9, effect: {} }, { value: null, effect: { damageModifier: true } }], 'damageModifier')).toBe(0);
  });
});

describe('swingsPerSecond', () => {
  it('maps the stat linearly: 25 = 2/s, 50 = 4/s', () => {
    expect(swingsPerSecond(25)).toBeCloseTo(2);
    expect(swingsPerSecond(50)).toBeCloseTo(4);
  });

  it('falls back to the baseline for 0 / invalid stats', () => {
    expect(swingsPerSecond(0)).toBeCloseTo(2);
    expect(swingsPerSecond(-5)).toBeCloseTo(2);
    expect(swingsPerSecond(NaN)).toBeCloseTo(2);
  });
});

describe('advanceSwing', () => {
  const fresh = (): SwingState => ({ swingCooldown: 0, swungThisTick: false });

  it('swings at the stat rate while wanted (25 => 2 swings in one second)', () => {
    const s = fresh();
    const dt = 1 / 30;
    let swings = 0;
    for (let i = 0; i < 30; i++) if (advanceSwing(s, dt, true, 25)) swings++;
    expect(swings).toBe(2);
  });

  it('faster stat swings proportionally more', () => {
    const s = fresh();
    const dt = 1 / 30;
    let swings = 0;
    for (let i = 0; i < 30; i++) if (advanceSwing(s, dt, true, 50)) swings++;
    expect(swings).toBe(4);
  });

  it('never swings when not wanted, and the timer still counts down', () => {
    const s = fresh();
    s.swingCooldown = 0.4;
    expect(advanceSwing(s, 0.5, false, 25)).toBe(false);
    expect(s.swungThisTick).toBe(false);
    expect(advanceSwing(s, 0.01, true, 25)).toBe(true);
  });

  it('clears swungThisTick on the next tick', () => {
    const s = fresh();
    advanceSwing(s, 0.033, true, 25);
    expect(s.swungThisTick).toBe(true);
    advanceSwing(s, 0.033, true, 25);
    expect(s.swungThisTick).toBe(false);
  });
});
