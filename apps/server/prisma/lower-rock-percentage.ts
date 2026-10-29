/**
 * One-off data script (ticket 147): there were too many rocks, so a map config still on the old 6% goes to 2%. A config the
 * owner already set to something else is left alone.
 *
 *   npx tsx prisma/lower-rock-percentage.ts           # dry run
 *   npx tsx prisma/lower-rock-percentage.ts --apply   # does it
 */
import { PrismaClient } from '@prisma/client';

export const OLD_ROCK_PERCENTAGE = 6;
export const NEW_ROCK_PERCENTAGE = 2;

/** The configs to change: only those still at the old default. */
export function configsToLower<T extends { rockPercentage: number }>(rows: readonly T[]): T[] {
  return rows.filter((r) => r.rockPercentage === OLD_ROCK_PERCENTAGE);
}

async function main() {
  const apply = process.argv.includes('--apply');
  const prisma = new PrismaClient();
  try {
    const rows = await prisma.miningMapConfig.findMany({ select: { id: true, name: true, rockPercentage: true } });
    const todo = configsToLower(rows);
    for (const r of rows) console.log(`Map config "${r.name}": ${todo.includes(r) ? `rocks ${r.rockPercentage}% -> ${NEW_ROCK_PERCENTAGE}%` : `${r.rockPercentage}%, kept`}`);
    if (!apply) {
      console.log('Dry run. Re-run with --apply to write.');
      return;
    }
    for (const r of todo) await prisma.miningMapConfig.update({ where: { id: r.id }, data: { rockPercentage: NEW_ROCK_PERCENTAGE } });
    console.log('Done. Restart the server to load it.');
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
