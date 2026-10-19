/**
 * Sets `rockPercentage` (the share of solid cells that are rock) on the active mining map config.
 * Touches nothing else (unlike `prisma db seed`, which overwrites admin edits). Dry run unless --apply.
 *
 *   npx tsx prisma/set-rock-percentage.ts 6           # dry run: prints the change
 *   npx tsx prisma/set-rock-percentage.ts 6 --apply   # does it
 */
import { PrismaClient } from '@prisma/client';

export function parsePercentage(raw: string | undefined): number {
  const value = raw === undefined || raw.trim() === '' ? NaN : Number(raw);
  if (!Number.isInteger(value) || value < 0 || value > 50) throw new Error('Give a whole number from 0 to 50, e.g. 6');
  return value;
}

async function main() {
  const percentage = parsePercentage(process.argv[2]);
  const apply = process.argv.includes('--apply');
  const prisma = new PrismaClient();
  try {
    const configs = await prisma.miningMapConfig.findMany({ where: { isActive: true } });
    for (const config of configs) {
      console.log(`${config.name} (${config.id}): rockPercentage ${config.rockPercentage} -> ${percentage}`);
      if (apply) await prisma.miningMapConfig.update({ where: { id: config.id }, data: { rockPercentage: percentage } });
    }
    console.log(apply ? 'Applied.' : 'Dry run: nothing changed. Add --apply to do it.');
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) main().catch((e) => { console.error(e.message); process.exit(1); });
