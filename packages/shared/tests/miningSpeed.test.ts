import { describe, it, expect } from 'vitest';
import {
  calculateEffectiveSwingSpeed,
  DEFAULT_MINING_SWING_SPEED,
  getItemMiningSpeedEffect,
  getItemDamageEffect,
  calculateEffectiveMiningDamage,
  DEFAULT_MINING_DAMAGE,
} from '../src/gameLogic/miningSpeed';
import { MINING_CONFIG } from '../src/types/mining';
import type { GameItem } from '../src/types';

describe('calculateEffectiveSwingSpeed', () => {
  it('returns default swing speed (2.0) when no weapon or stats are provided', () => {
    const speed = calculateEffectiveSwingSpeed(null, undefined);
    expect(speed).toBe(DEFAULT_MINING_SWING_SPEED);
    expect(speed).toBe(2.0);
  });

  it('calculates exact 2.0 swings/sec for standard 25 mining speed pickaxe', () => {
    const weaponWithEffect: GameItem = {
      id: 'weapon-pickaxe-1',
      name: 'Basic Pickaxe',
      description: 'A basic pickaxe',
      type: 'GEAR',
      subType: 'WEAPON',
      priceSol: 10,
      itemEffects: [
        {
          id: 'ie-1',
          itemId: 'weapon-pickaxe-1',
          effectId: 'eff-1',
          value: 25,
          effect: {
            id: 'eff-1',
            name: 'Mining Speed',
            description: 'Fast mining',
            miningSpeedModifier: true,
            healthGain: false,
            staminaGain: false,
            explodes: false,
          },
        } as any,
      ],
    };

    expect(getItemMiningSpeedEffect(weaponWithEffect)).toBe(25);
    // At speed 25, damage rate is 250 ms/s. Dirt takes 125 ms per stage -> 2.0 hits/sec!
    const speed = calculateEffectiveSwingSpeed(weaponWithEffect);
    expect(speed).toBe(2.0);
  });

  it('scales swing speed proportionally with mining speed attribute', () => {
    // 50 mining speed: 500 ms/s damage rate -> 500 / 125 = 4.0 swings/sec
    expect(calculateEffectiveSwingSpeed(null, 50)).toBeCloseTo(4.0, 2);

    // 37.5 mining speed: 375 ms/s damage rate -> 375 / 125 = 3.0 swings/sec
    expect(calculateEffectiveSwingSpeed(null, 37.5)).toBeCloseTo(3.0, 2);
  });

  it('respects minimum and maximum animation bounds', () => {
    // Very low speed (e.g. 5) clamps to MIN_SWING_SPEED (1.0)
    expect(calculateEffectiveSwingSpeed(null, 5)).toBe(MINING_CONFIG.MIN_SWING_SPEED);

    // Very high speed (e.g. 200) clamps to MAX_SWING_SPEED (5.0)
    expect(calculateEffectiveSwingSpeed(null, 200)).toBe(MINING_CONFIG.MAX_SWING_SPEED);
  });

  it('defaults to base tool speed when characterMiningSpeed is 0 and weapon has no modifier', () => {
    const plainTool: GameItem = {
      id: 'tool-plain',
      name: 'Plain Tool',
      description: 'Normal',
      type: 'GEAR',
      subType: 'WEAPON',
      priceSol: 1,
    };
    expect(calculateEffectiveSwingSpeed(plainTool, 0)).toBe(DEFAULT_MINING_SWING_SPEED);
  });
});

describe('calculateEffectiveMiningDamage', () => {
  it('returns DEFAULT_MINING_DAMAGE (25) when no weapon or stats are provided', () => {
    expect(calculateEffectiveMiningDamage(null, undefined)).toBe(DEFAULT_MINING_DAMAGE);
    expect(calculateEffectiveMiningDamage(null, undefined)).toBe(25);
  });

  it('uses characterMiningDamage when provided and > 0', () => {
    expect(calculateEffectiveMiningDamage(null, 50)).toBe(50);
  });

  it('extracts damage modifier from weapon itemEffects when characterMiningDamage is not set', () => {
    const weapon: GameItem = {
      id: 'weapon-pickaxe-1',
      name: 'Heavy Pickaxe',
      description: 'Heavy hitting pickaxe',
      type: 'GEAR',
      subType: 'WEAPON',
      priceSol: 10,
      itemEffects: [
        {
          id: 'ie-dmg',
          itemId: 'weapon-pickaxe-1',
          effectId: 'eff-dmg',
          value: 45,
          effect: {
            id: 'eff-dmg',
            name: 'Damage',
            damageModifier: true,
            miningSpeedModifier: false,
            healthGain: false,
            staminaGain: false,
            explodes: false,
          },
        } as any,
      ],
    };

    // A plain Damage effect is weapon damage (mobs, bullets); it does not count as tool damage
    expect(getItemDamageEffect(weapon)).toBe(45);
    expect(calculateEffectiveMiningDamage(weapon)).toBe(DEFAULT_MINING_DAMAGE);
  });

  it('extracts tool damage from the Tool Damage effect', () => {
    const tool: any = {
      itemEffects: [{ value: 60, effect: { toolDamageModifier: true } }],
    };
    expect(calculateEffectiveMiningDamage(tool)).toBe(60);
  });
});
