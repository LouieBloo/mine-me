/**
 * One-off, idempotent data script (tickets 108/109, owner answer 2026-10-28): a "clear a fluid / gas" objective is an amount of
 * CELLS now, not a percent of the whole map. The starter missions are set to cell counts (the same numbers `add-first-missions.ts`
 * seeds). A clear objective on a mission that is not a starter one (made in the admin) is left alone and reported, since only its
 * author knows what amount was meant. Refreshes the dev seed file missions.json.
 *
 *   npx tsx prisma/convert-mission-clear-cells.ts           # dry run: prints what it would do
 *   npx tsx prisma/convert-mission-clear-cells.ts --apply   # does it
 */
import fs from 'fs';
import path from 'path';
import { Prisma, PrismaClient } from '@prisma/client';
import type { ObjectiveDefinition } from '@mine-me/shared';
import { FIRST_MISSIONS } from './add-first-missions';

const isClear = (o: Pick<ObjectiveDefinition, 'type'>) => o.type === 'CLEAR_FLUID' || o.type === 'CLEAR_GAS';

export interface ConvertRow { key: string; objectives: ObjectiveDefinition[] }
export interface ConvertPlan { key: string; action: 'set' | 'keep' | 'manual'; objectives?: ObjectiveDefinition[]; notes: string[] }

/** What to do for each mission that has a clear objective: set the starter amounts, keep ones already right, report others. */
export function planConversion(rows: readonly ConvertRow[], templates = FIRST_MISSIONS): ConvertPlan[] {
  const plan: ConvertPlan[] = [];
  for (const row of rows) {
    const clears = row.objectives.filter(isClear);
    if (clears.length === 0) continue;
    const template = templates.find((t) => t.key === row.key);
    if (!template) {
      plan.push({ key: row.key, action: 'manual', notes: clears.map((o) => `${o.type} amount ${o.amount} left as is (now cells; check it in the admin)`) });
      continue;
    }
    const wanted = template.objectives.filter(isClear);
    let n = 0;
    const objectives = row.objectives.map((o) => (isClear(o) ? { ...o, amount: wanted[n++]?.amount ?? o.amount } : o));
    const changed = objectives.some((o, i) => o.amount !== row.objectives[i].amount);
    plan.push({ key: row.key, action: changed ? 'set' : 'keep', objectives, notes: clears.map((o, i) => `${o.type} ${o.amount} -> ${objectives.filter(isClear)[i].amount} cells`) });
  }
  return plan;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const prisma = new PrismaClient();
  try {
    const rows = await prisma.mission.findMany({ select: { key: true, objectives: true } });
    const plan = planConversion(rows.map((r) => ({ key: r.key, objectives: (r.objectives ?? []) as unknown as ObjectiveDefinition[] })));
    if (plan.length === 0) console.log('No mission has a clear objective.');
    for (const p of plan) console.log(`Mission ${p.key}: ${p.action === 'set' ? 'will change' : p.action === 'keep' ? 'already in cells, kept' : 'not a starter mission, skipped'} - ${p.notes.join('; ')}`);
    if (!apply) {
      console.log('Dry run. Re-run with --apply to write.');
      return;
    }
    for (const p of plan) if (p.action === 'set') await prisma.mission.update({ where: { key: p.key }, data: { objectives: p.objectives as unknown as Prisma.InputJsonValue } });
    const all = await prisma.mission.findMany({ orderBy: { key: 'asc' } });
    const mirror = all.map((m) => ({ ...m, objectives: m.objectives ?? [], rewardItems: m.rewardItems ?? [], soundEffects: m.soundEffects ?? null }));
    fs.writeFileSync(path.join(__dirname, '../../../packages/shared/src/data/missions.json'), JSON.stringify(mirror, null, 2));
    console.log('Done. Restart the server (or save any mission in the admin) to load them.');
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
