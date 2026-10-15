/**
 * One-off, idempotent data script (ticket 066): adds the Hydrogen and Nitrogen gases to the Gas table.
 *
 * Creates each gas that does not exist yet. A gas that already exists keeps everything the owner has
 * tuned in the admin. The values come from the dev mirror `packages/shared/src/data/gases.json`.
 *
 *   npx tsx prisma/add-test-gases.ts           # dry run
 *   npx tsx prisma/add-test-gases.ts --apply   # does it
 */
import fs from 'fs';
import path from 'path';
import { PrismaClient, Prisma } from '@prisma/client';
import { validateGas, type GasDefinition } from '@mine-me/shared';

export const TEST_GAS_KEYS = ['HYDROGEN', 'NITROGEN'] as const;

export type GasPlan = { typeKey: string; action: 'create' | 'skip' };

/** Create each test gas that no row has the key of yet; existing rows are never touched. */
export function planGases(existing: Array<{ typeKey: string }>, wanted: readonly string[] = TEST_GAS_KEYS): GasPlan[] {
  const have = new Set(existing.map((g) => g.typeKey));
  return wanted.map((typeKey) => ({ typeKey, action: have.has(typeKey) ? ('skip' as const) : ('create' as const) }));
}

/** The test gases as defined in the dev mirror, checked against the same rules the admin enforces. */
export function loadTestGasDefinitions(mirrorPath = path.resolve(__dirname, '../../../packages/shared/src/data/gases.json')): GasDefinition[] {
  const gases = JSON.parse(fs.readFileSync(mirrorPath, 'utf-8')) as GasDefinition[];
  return TEST_GAS_KEYS.map((key) => {
    const gas = gases.find((g) => g.typeKey === key);
    if (!gas) throw new Error(`${key} not found in ${mirrorPath}`);
    const errors = validateGas(gas);
    if (errors.length > 0) throw new Error(`${key} is invalid: ${errors.join('; ')}`);
    return gas;
  });
}

const json = (value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull =>
  value == null ? Prisma.JsonNull : (value as Prisma.InputJsonValue);

async function main() {
  const apply = process.argv.includes('--apply');
  const prisma = new PrismaClient();
  try {
    const defs = loadTestGasDefinitions();
    const plans = planGases(await prisma.gas.findMany({ select: { typeKey: true } }));
    for (const plan of plans) console.log(`Gas ${plan.typeKey}:`, plan.action === 'create' ? 'will be created' : 'exists, skipped');
    if (!apply) {
      console.log('Dry run. Re-run with --apply to write.');
      return;
    }
    for (const plan of plans) {
      if (plan.action !== 'create') continue;
      const gas = defs.find((g) => g.typeKey === plan.typeKey)!;
      await prisma.gas.create({
        data: {
          id: gas.id,
          typeKey: gas.typeKey,
          name: gas.name,
          description: gas.description ?? null,
          color: gas.color,
          opacity: gas.opacity,
          density: gas.density,
          diffusionRate: gas.diffusionRate,
          minConcentration: gas.minConcentration,
          ventLifetime: gas.ventLifetime,
          appearance: json(gas.appearance),
          flammability: json(gas.flammability),
          generation: json(gas.generation),
        },
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
