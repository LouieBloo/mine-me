/**
 * One-off, idempotent data migration for ticket 019: mobs now use their own numbers directly.
 *
 *  1. `miningSpeed` is a percentage of the base mining rate. Old rows stored small multipliers
 *     (0.25 meant 25%) that the engine used to multiply by 100 at load time; those become percentages.
 *  2. `aiConfig.detectionRadius` (never read by anything) becomes `aiConfig.aggroRange`.
 *
 * It touches nothing else (unlike `prisma db seed`, which re-writes every mob from the JSON file).
 *
 *   npx tsx prisma/migrate-mob-stats.ts           # dry run: prints what it would do
 *   npx tsx prisma/migrate-mob-stats.ts --apply   # does it
 */
import { PrismaClient } from '@prisma/client';

interface MobRow { id: string; name: string; miningSpeed: number; aiConfig: Record<string, unknown> | null }

export interface MobPatch {
  mobId: string;
  mobName: string;
  miningSpeed?: number;
  aiConfig?: Record<string, unknown>;
  notes: string[];
}

/** Largest value still read as a legacy multiplier (anything above is already a percentage). */
const LEGACY_MULTIPLIER_MAX = 10;

/** Pure planner: the changes needed to bring each mob up to date; mobs already current yield nothing. */
export function planMobStatMigration(mobs: MobRow[]): MobPatch[] {
  const patches: MobPatch[] = [];
  for (const mob of mobs) {
    const patch: MobPatch = { mobId: mob.id, mobName: mob.name, notes: [] };

    if (mob.miningSpeed > 0 && mob.miningSpeed <= LEGACY_MULTIPLIER_MAX) {
      patch.miningSpeed = Math.round(mob.miningSpeed * 100 * 1000) / 1000;
      patch.notes.push(`miningSpeed ${mob.miningSpeed} -> ${patch.miningSpeed}`);
    }

    const ai = mob.aiConfig;
    if (ai && typeof ai === 'object' && 'detectionRadius' in ai) {
      const { detectionRadius, ...rest } = ai;
      patch.aiConfig = 'aggroRange' in rest ? rest : { ...rest, aggroRange: detectionRadius };
      patch.notes.push(`aiConfig.detectionRadius -> aggroRange`);
    }

    if (patch.notes.length > 0) patches.push(patch);
  }
  return patches;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const prisma = new PrismaClient();
  try {
    const mobs = await prisma.mob.findMany();
    const patches = planMobStatMigration(mobs as any);
    if (patches.length === 0) {
      console.log('Nothing to do: the database is already migrated.');
      return;
    }
    for (const p of patches) console.log(`${apply ? 'updating' : 'would update'} "${p.mobName}": ${p.notes.join('; ')}`);
    if (!apply) {
      console.log('\nDry run only. Re-run with --apply to make these changes.');
      return;
    }
    for (const p of patches) {
      await prisma.mob.update({
        where: { id: p.mobId },
        data: { ...(p.miningSpeed !== undefined && { miningSpeed: p.miningSpeed }), ...(p.aiConfig && { aiConfig: p.aiConfig as any }) },
      });
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
