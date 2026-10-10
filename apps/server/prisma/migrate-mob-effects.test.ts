import { describe, it, expect } from 'vitest';
import { planMobEffectMigration, STAT_FLAGS, LEGACY_TOOL_DAMAGE, type MobRow } from './migrate-mob-effects';

const mob = (over: Partial<MobRow> = {}): MobRow => ({
  id: 'id', name: 'Mob', attack: 6, miningSpeed: 25, aiConfig: null, existingEffectFlags: [], ...over,
});

describe('planMobEffectMigration', () => {
  it('turns attack and miningSpeed into Damage and Mining Speed effects, and adds legacy Tool Damage', () => {
    const [p] = planMobEffectMigration([mob()]);
    expect(p.effects).toEqual({ miningSpeed: 25, weaponDamage: 6, toolDamage: LEGACY_TOOL_DAMAGE });
  });

  it('reads a legacy multiplier as a percentage (0.25 -> 25)', () => {
    const [p] = planMobEffectMigration([mob({ miningSpeed: 0.25 })]);
    expect(p.effects.miningSpeed).toBe(25);
  });

  it('a mob that never dug (miningSpeed 0) gets no Mining Speed or Tool Damage', () => {
    const [p] = planMobEffectMigration([mob({ miningSpeed: 0, attack: 3 })]);
    expect(p.effects).toEqual({ weaponDamage: 3 });
  });

  it('a mob with no stats at all (a dummy) yields nothing', () => {
    expect(planMobEffectMigration([mob({ miningSpeed: 0, attack: 0 })])).toEqual([]);
  });

  it('keeps the old digging throughput: Tool Damage x swings/s equals the old miningSpeed x 2 HP/s', () => {
    // whole numbers only: effect values are integers
    for (const speed of [25, 50, 100]) {
      const [p] = planMobEffectMigration([mob({ miningSpeed: speed, attack: 0 })]);
      const swingsPerSecond = 2 * (p.effects.miningSpeed! / 25);
      expect(p.effects.toolDamage! * swingsPerSecond).toBeCloseTo(speed * 2, 5);
    }
  });

  it('never overwrites an effect the mob already has (admin edits survive)', () => {
    const [p] = planMobEffectMigration([mob({ existingEffectFlags: [STAT_FLAGS.weaponDamage, STAT_FLAGS.toolDamage] })]);
    expect(p.effects).toEqual({ miningSpeed: 25 });
  });

  it('renames detectionRadius and drops attackCooldownMs, keeping other keys', () => {
    const [p] = planMobEffectMigration([mob({ aiConfig: { detectionRadius: 12, attackCooldownMs: 1000, mineRange: 1.1 } })]);
    expect(p.aiConfig).toEqual({ mineRange: 1.1, aggroRange: 12 });
  });

  it('does not overwrite an existing aggroRange', () => {
    const [p] = planMobEffectMigration([mob({ aiConfig: { detectionRadius: 12, aggroRange: 5 } })]);
    expect(p.aiConfig).toEqual({ aggroRange: 5 });
  });

  it('is idempotent: once effects and aiConfig are applied, planning again yields nothing', () => {
    const before = mob({ aiConfig: { detectionRadius: 12, attackCooldownMs: 800 } });
    const [p] = planMobEffectMigration([before]);
    const after = mob({
      aiConfig: p.aiConfig!,
      existingEffectFlags: Object.keys(p.effects).map((k) => STAT_FLAGS[k as keyof typeof STAT_FLAGS]),
    });
    expect(planMobEffectMigration([after])).toEqual([]);
  });
});
