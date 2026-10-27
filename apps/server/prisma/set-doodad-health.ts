/**
 * One-off, idempotent data script (ticket 143): gives the first doodads their starting health, so the creatures can be hurt and
 * killed and the hanging ones can be shot down. Only a doodad that has NO health yet is changed, so anything set in the admin is
 * never overwritten. Scenery that should stay unhurtable (mushrooms, moss, crystals, grass, vents) is left alone.
 *
 *   npx tsx prisma/set-doodad-health.ts           # dry run: prints what it would do
 *   npx tsx prisma/set-doodad-health.ts --apply   # does it
 */
import { PrismaClient } from '@prisma/client';

/** Starting hit points by doodad key. A first guess to tune in the admin. */
export const FIRST_DOODAD_HEALTH: Readonly<Record<string, number>> = {
  cave_beetle: 10,
  firefly: 1,
  stalactite: 15,
  dripping_stalactite: 15,
  icicle: 5,
};

export interface HealthPlanRow {
  key: string;
  action: 'set' | 'keep' | 'missing';
  health: number;
  current?: number | null;
}

/** What the script does for each key: sets health on a doodad that has none, keeps one that has some, notes a missing doodad. */
export function planHealth(rows: ReadonlyArray<{ key: string; health: number | null }>, wanted: Readonly<Record<string, number>> = FIRST_DOODAD_HEALTH): HealthPlanRow[] {
  return Object.entries(wanted).map(([key, health]) => {
    const row = rows.find((r) => r.key === key);
    if (!row) return { key, action: 'missing', health };
    return { key, action: row.health === null || row.health === undefined ? 'set' : 'keep', health, current: row.health };
  });
}

async function main() {
  const apply = process.argv.includes('--apply');
  const prisma = new PrismaClient();
  try {
    const rows = await prisma.doodad.findMany({ select: { key: true, health: true } });
    const plan = planHealth(rows);
    for (const p of plan) {
      const what = p.action === 'set' ? `health will be set to ${p.health}` : p.action === 'keep' ? `already has health ${p.current}, kept` : 'does not exist, skipped';
      console.log(`Doodad ${p.key}: ${what}`);
    }
    if (!apply) {
      console.log('Dry run. Re-run with --apply to write.');
      return;
    }
    for (const p of plan) if (p.action === 'set') await prisma.doodad.update({ where: { key: p.key }, data: { health: p.health } });
    console.log('Done. Restart the server (or save any doodad in the admin) to load them.');
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
