import { describe, it, expect, vi } from 'vitest';

vi.mock('../../index', () => ({ prisma: {} }));

import { buildMiningLoadout } from './miningLoadout';

// Fixtures only spell out the item fields the loadout reads, not whole database rows.
const build = (character: { inventory: object[] }) =>
  buildMiningLoadout(character as unknown as Parameters<typeof buildMiningLoadout>[0]);

const gear = (id: string, subType: string, extra: Record<string, unknown> = {}) => ({
  id: `inv-${id}`,
  quantity: 1,
  equipped: true,
  item: { id, type: 'GEAR', subType, combatScore: 0, defenseScore: 0, ...extra },
});

describe('buildMiningLoadout', () => {
  it('reports the equipped WEAPON-slot item and builds gear layers from equipped gear with art', () => {
    const l = build({
      inventory: [
        gear('gun', 'WEAPON', { gearImageUrl: '/gun.png', shootsProjectiles: true, muzzleOffsetX: 5 }),
        gear('hat', 'HEAD', { gearImageUrl: '/hat.png' }),
        gear('noart', 'BOOTS'),
        { ...gear('spare', 'WEAPON', { gearImageUrl: '/spare.png' }), equipped: false },
      ],
    });
    expect(l.equippedWeaponId).toBe('gun');
    expect(l.gearLayers.map((g) => g.url)).toEqual(['/gun.png', '/hat.png']);
    expect(l.gearLayers[0]).toMatchObject({ shootsProjectiles: true, muzzleOffsetX: 5 });
  });

  it('returns null weapon and no layers when nothing is equipped', () => {
    const l = build({ inventory: [{ ...gear('gun', 'WEAPON'), equipped: false }] });
    expect(l.equippedWeaponId).toBeNull();
    expect(l.gearLayers).toEqual([]);
  });

  it('a non-weapon gear piece is never reported as the weapon', () => {
    const l = build({ inventory: [gear('hat', 'HEAD', { gearImageUrl: '/hat.png' })] });
    expect(l.equippedWeaponId).toBeNull();
  });

  describe('combat stats from effects', () => {
    const eff = (flag: string, value: number) => ({ id: `ie-${flag}`, itemId: 'x', effectId: `e-${flag}`, value, effect: { id: `e-${flag}`, [flag]: true } });

    it('derives tool damage, weapon damage, pick power, knockback and speed from the equipped gear\'s effects', () => {
      const l = build({
        inventory: [
          gear('pick', 'WEAPON', {
            itemEffects: [eff('toolDamageModifier', 25), eff('damageModifier', 18), eff('pickPowerModifier', 2), eff('miningSpeedModifier', 30)],
          }),
          gear('gloves', 'GAUNTLETS', { itemEffects: [eff('pickPowerModifier', 1), eff('knockbackModifier', 20)] }),
          { ...gear('spare', 'WEAPON', { itemEffects: [eff('pickPowerModifier', 9)] }), equipped: false },
        ],
      });
      expect(l).toMatchObject({ toolDamage: 25, weaponDamage: 18, pickPower: 3, knockback: 20, miningSpeed: 30 });
    });

    it('a plain Damage effect is weapon damage only; tool damage needs the Tool Damage effect', () => {
      const l = build({ inventory: [gear('sword', 'WEAPON', { itemEffects: [eff('damageModifier', 40)] })] });
      expect(l.weaponDamage).toBe(40);
      expect(l.toolDamage).toBe(0);
    });

    it('is all zeros with nothing equipped', () => {
      const l = build({ inventory: [] });
      expect(l).toMatchObject({ toolDamage: 0, weaponDamage: 0, pickPower: 0, knockback: 0, miningSpeed: 0 });
    });
  });
});
