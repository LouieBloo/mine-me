/**
 * One-off, idempotent data script (ticket 051): adds the Oil fluid to the Fluid table.
 *
 * Creates Oil (typeKey OIL) if it does not exist. An existing Oil keeps everything the owner has tuned
 * in the admin; the only thing added to it is the generation settings (ticket 053), and only if it has
 * none. The values come from the dev mirror `packages/shared/src/data/fluids.json`.
 *
 *   npx tsx prisma/add-oil-fluid.ts           # dry run
 *   npx tsx prisma/add-oil-fluid.ts --apply   # does it
 */
import fs from 'fs';
import path from 'path';
import { PrismaClient, Prisma } from '@prisma/client';
import { validateFluid, type FluidDefinition } from '@mine-me/shared';

export const OIL_TYPE_KEY = 'OIL';

export type OilPlan = { action: 'create' } | { action: 'add-generation' } | { action: 'skip' };

/**
 * Create Oil when no fluid has its key yet. An existing Oil is left alone, except that one with no
 * generation settings gets them (so it appears in generated mines); anything edited stays as it is.
 */
export function planOil(existing: Array<{ typeKey: string; generation?: unknown }>): OilPlan {
  const oil = existing.find((f) => f.typeKey === OIL_TYPE_KEY);
  if (!oil) return { action: 'create' };
  return oil.generation == null ? { action: 'add-generation' } : { action: 'skip' };
}

/** Oil as defined in the dev mirror, checked against the same rules the admin will enforce. */
export function loadOilDefinition(mirrorPath = path.resolve(__dirname, '../../../packages/shared/src/data/fluids.json')): FluidDefinition {
  const fluids = JSON.parse(fs.readFileSync(mirrorPath, 'utf-8')) as FluidDefinition[];
  const oil = fluids.find((f) => f.typeKey === OIL_TYPE_KEY);
  if (!oil) throw new Error(`${OIL_TYPE_KEY} not found in ${mirrorPath}`);
  const errors = validateFluid(oil);
  if (errors.length > 0) throw new Error(`Oil is invalid: ${errors.join('; ')}`);
  return oil;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const prisma = new PrismaClient();
  try {
    const oil = loadOilDefinition();
    const existing = await prisma.fluid.findMany({ select: { typeKey: true, generation: true } });
    const plan = planOil(existing);
    const say = { create: 'will be created', 'add-generation': 'exists, will get its generation settings', skip: 'exists, skipped' }[plan.action];
    console.log(`Fluid "${oil.name}" (${OIL_TYPE_KEY}):`, say);
    if (!apply) {
      console.log('Dry run. Re-run with --apply to write.');
      return;
    }
    if (plan.action === 'create') {
      await prisma.fluid.create({
        data: {
          id: oil.id,
          typeKey: oil.typeKey,
          name: oil.name,
          description: oil.description ?? null,
          color: oil.color,
          opacity: oil.opacity,
          density: oil.density,
          viscosity: oil.viscosity,
          flowRate: oil.flowRate,
          minLevel: oil.minLevel,
          flowThreshold: oil.flowThreshold,
          flammability: oil.flammability ? (oil.flammability as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
          generation: oil.generation ? (oil.generation as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
        },
      });
    } else if (plan.action === 'add-generation' && oil.generation) {
      await prisma.fluid.update({
        where: { typeKey: OIL_TYPE_KEY },
        data: { generation: oil.generation as unknown as Prisma.InputJsonValue },
      });
    }
    console.log('Done.');
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
