/**
 * One-off, idempotent data script (ticket 079): gives Water its pool generation (puddles on cave floors at any
 * depth) when it has none. Water created before this ticket was made without generation settings. An existing
 * generation (tuned in the admin) is never changed, and nothing else is touched.
 *
 *   npx tsx prisma/add-pool-generation.ts           # dry run
 *   npx tsx prisma/add-pool-generation.ts --apply   # does it
 */
import { PrismaClient, Prisma } from '@prisma/client';
import { validateFluidGeneration } from '@mine-me/shared';
import { WATER_POOLS } from './add-water-and-lava';

/** Whether Water needs the generation: it exists and has none. */
export function needsPoolGeneration(water: { generation: unknown } | null): boolean {
  return water !== null && water.generation == null;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const errors = validateFluidGeneration(WATER_POOLS);
  if (errors.length > 0) throw new Error(`Pool generation is invalid: ${errors.join('; ')}`);
  const prisma = new PrismaClient();
  try {
    const water = await prisma.fluid.findUnique({ where: { typeKey: 'WATER' }, select: { generation: true } });
    const needs = needsPoolGeneration(water);
    console.log('Fluid WATER:', water === null ? 'does not exist (run add-water-and-lava.ts first)' : needs ? 'will get pool generation' : 'already has generation, skipped');
    if (!apply) {
      console.log('Dry run. Re-run with --apply to write.');
      return;
    }
    if (needs) await prisma.fluid.update({ where: { typeKey: 'WATER' }, data: { generation: WATER_POOLS as unknown as Prisma.InputJsonValue } });
    console.log('Done. Restart the server (or save any fluid in the admin) to load it.');
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
