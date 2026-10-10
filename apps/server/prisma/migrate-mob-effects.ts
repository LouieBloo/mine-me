/**
 * One-off, idempotent data migration for ticket 019: mobs get their combat stats from Effects,
 * exactly like gear, instead of from `attack` / `miningSpeed` columns and `aiConfig.attackCooldownMs`.
 *
 * For each mob that has no effects yet:
 *   - `miningSpeed`  -> a Mining Speed effect (legacy values <= 10 were multipliers, so 0.25 -> 25)
 *   - `attack`       -> a Damage effect
 *   - a Tool Damage effect of 25 for mobs that dug (miningSpeed > 0): the old engine dealt
 *     miningSpeed x 2 HP/s, which is 25 per swing at any speed, so digging throughput is unchanged
 * It also renames `aiConfig.detectionRadius` to `aggroRange` and removes `aiConfig.attackCooldownMs`.
 * Effects are found by their flag, never by name. It touches nothing else (unlike `prisma db seed`).
 *
 *   npx tsx prisma/migrate-mob-effects.ts           # dry run: prints what it would do
 *   npx tsx prisma/migrate-mob-effects.ts --apply   # does it
 *
 * Run it BEFORE `prisma db push` drops the old columns (it reads them with raw SQL). On a database
 * where they are already gone it reports there is nothing to do.
 */
import { PrismaClient } from '@prisma/client';

export type EffectKey = 'miningSpeed' | 'weaponDamage' | 'toolDamage';

/** Effect flag (see the Effect model) that each stat is stored under. */
export const STAT_FLAGS: Record<EffectKey, string> = {
  miningSpeed: 'miningSpeedModifier',
  weaponDamage: 'damageModifier',
  toolDamage: 'toolDamageModifier',
};

/** Tool Damage given to mobs that used to dig (25 = the old digging throughput at any speed). */
export const LEGACY_TOOL_DAMAGE = 25;

/** Largest value still read as a legacy multiplier (anything above is already a percentage). */
const LEGACY_MULTIPLIER_MAX = 10;

export interface MobRow {
  id: string;
  name: string;
  attack: number;
  miningSpeed: number;
  aiConfig: Record<string, unknown> | null;
  /** Flags of effects the mob already has (empty = not migrated yet). */
  existingEffectFlags: string[];
}

export interface MobPlan {
  mobId: string;
  mobName: string;
  /** Effect values to attach, by stat. */
  effects: Partial<Record<EffectKey, number>>;
  /** New aiConfig when it changes. */
  aiConfig?: Record<string, unknown>;
  notes: string[];
}

/** Pure planner: what to attach/change per mob; mobs that are already current yield nothing. */
export function planMobEffectMigration(mobs: MobRow[]): MobPlan[] {
  const plans: MobPlan[] = [];
  for (const mob of mobs) {
    const plan: MobPlan = { mobId: mob.id, mobName: mob.name, effects: {}, notes: [] };
    const has = (key: EffectKey) => mob.existingEffectFlags.includes(STAT_FLAGS[key]);

    const speed =
      mob.miningSpeed > 0 && mob.miningSpeed <= LEGACY_MULTIPLIER_MAX
        ? Math.round(mob.miningSpeed * 100 * 1000) / 1000
        : mob.miningSpeed;

    const add = (key: EffectKey, value: number, why: string) => {
      if (has(key) || !(value > 0)) return;
      plan.effects[key] = Math.round(value);
      plan.notes.push(`+ ${key} ${Math.round(value)} (${why})`);
    };
    add('miningSpeed', speed, `from miningSpeed ${mob.miningSpeed}`);
    add('weaponDamage', mob.attack, `from attack ${mob.attack}`);
    if (speed > 0) add('toolDamage', LEGACY_TOOL_DAMAGE, 'keeps the old digging throughput');

    const ai = mob.aiConfig;
    if (ai && typeof ai === 'object') {
      const { detectionRadius, attackCooldownMs, ...rest } = ai as Record<string, unknown>;
      const changed = 'detectionRadius' in ai || 'attackCooldownMs' in ai;
      if (changed) {
        plan.aiConfig = detectionRadius !== undefined && !('aggroRange' in rest) ? { ...rest, aggroRange: detectionRadius } : rest;
        if ('detectionRadius' in ai) plan.notes.push('aiConfig.detectionRadius -> aggroRange');
        if ('attackCooldownMs' in ai) plan.notes.push('aiConfig.attackCooldownMs removed (Mining Speed sets the swing rate)');
      }
    }

    if (plan.notes.length > 0) plans.push(plan);
  }
  return plans;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const prisma = new PrismaClient();
  try {
    const effects = await prisma.effect.findMany();
    const effectIdByStat = {} as Record<EffectKey, string>;
    for (const key of Object.keys(STAT_FLAGS) as EffectKey[]) {
      const found = effects.find((e) => (e as any)[STAT_FLAGS[key]] === true);
      if (!found) {
        throw new Error(`No effect with ${STAT_FLAGS[key]} exists. Run prisma/migrate-combat-stats.ts first.`);
      }
      effectIdByStat[key] = found.id;
    }

    // The old columns are no longer in the Prisma schema, so read them with raw SQL. If they are
    // already gone (schema pushed after migrating), there is nothing left to migrate.
    let legacy: { id: string; attack: number; miningSpeed: number }[];
    try {
      legacy = await prisma.$queryRaw`SELECT "id", "attack", "miningSpeed" FROM "Mob"`;
    } catch {
      console.log('Nothing to do: the Mob.attack / Mob.miningSpeed columns no longer exist (already migrated).');
      return;
    }
    const legacyById = new Map(legacy.map((l) => [l.id, l]));

    const mobs = await prisma.mob.findMany({ include: { mobEffects: { include: { effect: true } } } });
    const rows: MobRow[] = mobs.map((m: any) => ({
      id: m.id,
      name: m.name,
      attack: Number(legacyById.get(m.id)?.attack ?? 0),
      miningSpeed: Number(legacyById.get(m.id)?.miningSpeed ?? 0),
      aiConfig: m.aiConfig,
      existingEffectFlags: m.mobEffects.flatMap((me: any) =>
        Object.values(STAT_FLAGS).filter((flag) => me.effect?.[flag] === true)
      ),
    }));

    const plans = planMobEffectMigration(rows);
    if (plans.length === 0) {
      console.log('Nothing to do: every mob is already migrated.');
      return;
    }
    for (const p of plans) console.log(`${apply ? 'updating' : 'would update'} "${p.mobName}":\n  ${p.notes.join('\n  ')}`);
    if (!apply) {
      console.log('\nDry run only. Re-run with --apply to make these changes.');
      return;
    }
    for (const p of plans) {
      for (const [key, value] of Object.entries(p.effects) as [EffectKey, number][]) {
        await prisma.objectEffects.create({ data: { mobId: p.mobId, effectId: effectIdByStat[key], value } });
      }
      if (p.aiConfig) await prisma.mob.update({ where: { id: p.mobId }, data: { aiConfig: p.aiConfig as any } });
    }
    console.log('\nDone.');
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
