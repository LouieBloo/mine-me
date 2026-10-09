import { describe, it, expect } from 'vitest';
import { planCombatStatMigration, NEW_EFFECTS } from '../prisma/migrate-combat-stats';

const eff = (id: string, name: string, flags: Record<string, boolean> = {}) => ({
  id, name, miningSpeedModifier: false, damageModifier: false, toolDamageModifier: false, ...flags,
});
const speed = eff('e-speed', 'Mining Speed', { miningSpeedModifier: true });
const damage = eff('e-dmg', 'Damage', { damageModifier: true });

describe('planCombatStatMigration', () => {
  it('creates the three missing effects', () => {
    const ops = planCombatStatMigration([speed, damage], []);
    expect(ops.filter((o) => o.kind === 'create-effect').map((o: any) => o.name)).toEqual(NEW_EFFECTS.map((e) => e.name));
  });

  it('creates only the effects that are missing', () => {
    const ops = planCombatStatMigration([speed, damage, eff('x', 'Pick Power')], []);
    expect(ops.filter((o) => o.kind === 'create-effect').map((o: any) => o.name)).toEqual(['Tool Damage', 'Knockback']);
  });

  it('gives a mining tool Tool Damage equal to its old Damage', () => {
    const items = [{ id: 'pick', name: 'Pickaxe', itemEffects: [{ effectId: 'e-speed', value: 25 }, { effectId: 'e-dmg', value: 25 }] }];
    const ops = planCombatStatMigration([speed, damage], items);
    expect(ops).toContainEqual({ kind: 'add-tool-damage', itemId: 'pick', itemName: 'Pickaxe', effectId: 'eff_tool_damage', value: 25 });
  });

  it('sums several Damage effects on one item', () => {
    const items = [{ id: 'pick', name: 'Pickaxe', itemEffects: [{ effectId: 'e-speed', value: 25 }, { effectId: 'e-dmg', value: 20 }, { effectId: 'e-dmg', value: 5 }] }];
    expect(planCombatStatMigration([speed, damage], items)).toContainEqual(expect.objectContaining({ kind: 'add-tool-damage', value: 25 }));
  });

  it('leaves weapons without Mining Speed (e.g. a gun) alone', () => {
    const items = [{ id: 'gun', name: 'Revolver', itemEffects: [{ effectId: 'e-dmg', value: 35 }] }];
    expect(planCombatStatMigration([speed, damage], items).some((o) => o.kind === 'add-tool-damage')).toBe(false);
  });

  it('leaves items that already have Tool Damage alone, reusing an existing Tool Damage effect id', () => {
    const toolDmg = eff('custom-tool', 'Tool Damage', { toolDamageModifier: true });
    const items = [
      { id: 'a', name: 'Already', itemEffects: [{ effectId: 'e-speed', value: 25 }, { effectId: 'e-dmg', value: 25 }, { effectId: 'custom-tool', value: 40 }] },
      { id: 'b', name: 'Needs', itemEffects: [{ effectId: 'e-speed', value: 25 }, { effectId: 'e-dmg', value: 30 }] },
    ];
    const ops = planCombatStatMigration([speed, damage, toolDmg], items);
    const adds = ops.filter((o) => o.kind === 'add-tool-damage') as any[];
    expect(adds).toHaveLength(1);
    expect(adds[0]).toMatchObject({ itemId: 'b', effectId: 'custom-tool', value: 30 });
  });

  it('is a no-op once migrated', () => {
    const all = [speed, damage, eff('t', 'Tool Damage', { toolDamageModifier: true }), eff('p', 'Pick Power'), eff('k', 'Knockback')];
    const items = [{ id: 'pick', name: 'Pickaxe', itemEffects: [{ effectId: 'e-speed', value: 25 }, { effectId: 'e-dmg', value: 25 }, { effectId: 't', value: 25 }] }];
    expect(planCombatStatMigration(all, items)).toEqual([]);
  });

  it('ignores items with no effects', () => {
    expect(planCombatStatMigration([speed, damage], [{ id: 'rock', name: 'Rock', itemEffects: [] }]).every((o) => o.kind === 'create-effect')).toBe(true);
  });
});
