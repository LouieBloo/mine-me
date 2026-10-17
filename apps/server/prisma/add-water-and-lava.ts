/**
 * One-off, idempotent data script (ticket 078): adds the Water and Lava fluids.
 *
 * Creates each fluid only if no fluid has its key yet; an existing one keeps everything tuned in the admin.
 * Lava hardens into the LAVAROCK block when water touches it (run add-lavarock.ts first), hurts and ignites
 * anything in it, glows, and flows very slowly. Water is thin and fast and puts fires out. All the numbers
 * are starting values to tune in the admin Fluids page.
 *
 *   npx tsx prisma/add-water-and-lava.ts           # dry run
 *   npx tsx prisma/add-water-and-lava.ts --apply   # does it
 */
import { PrismaClient, Prisma } from '@prisma/client';
import { validateFluid, type FluidDefinition } from '@mine-me/shared';

export type NewFluid = Required<Pick<FluidDefinition, 'id' | 'typeKey' | 'name' | 'description' | 'color' | 'opacity' | 'density' | 'viscosity' | 'flowRate' | 'minLevel' | 'flowThreshold'>> &
  Pick<FluidDefinition, 'appearance' | 'flammability' | 'generation' | 'contact' | 'light' | 'reactions'>;

/** Puddles on cave floors at any depth (ticket 079). Existing databases get this from add-pool-generation.ts. */
export const WATER_POOLS: NonNullable<FluidDefinition['generation']> = { mode: 'POOL', minDepth: 2, maxDepth: null, percentage: 6, minSize: 3, maxSize: 6 };

export const WATER: NewFluid = {
  id: 'fluid_water',
  typeKey: 'WATER',
  name: 'Water',
  description: 'Clear, thin water. Flows fast, puts out fires and cools lava into stone.',
  color: '#3b82f6',
  opacity: 0.6,
  density: 1,
  viscosity: 0.25,
  flowRate: 0.6,
  minLevel: 0.02,
  flowThreshold: 0.01,
  appearance: { waveAmplitude: 0.08, waveSpeed: 1.2, highlight: 0.6, depthDarkening: 0.4, depthOpacity: 0.3 },
  flammability: null,
  generation: WATER_POOLS,
  contact: { extinguishes: true },
  light: null,
  reactions: null,
};

export const LAVA: NewFluid = {
  id: 'fluid_lava',
  typeKey: 'LAVA',
  name: 'Lava',
  description: 'Molten rock. Creeps slowly, glows, burns anything in it, and sets hard when water reaches it.',
  color: '#ff5a14',
  opacity: 0.95,
  density: 3,
  viscosity: 0.85,
  flowRate: 0.06,
  minLevel: 0.05,
  flowThreshold: 0.03,
  appearance: { waveAmplitude: 0.03, waveSpeed: 0.3, highlight: 0.8, depthDarkening: 0.25, depthOpacity: 0.2 },
  flammability: null,
  generation: { minDepth: 15, maxDepth: null, percentage: 3, minSize: 2, maxSize: 4 },
  contact: { damagePerSecond: 25, ignites: 100 },
  light: { enabled: true, type: 'POINT', effect: 'FLICKER', color: '#ff6a1a', radius: 5, intensity: 0.9, flickerSpeed: 6, flickerAmount: 0.15 },
  reactions: [{ with: 'WATER', becomes: 'LAVAROCK', costPerLevel: 2 }],
};

/** The fluids this script adds. */
export const NEW_FLUIDS: readonly NewFluid[] = [WATER, LAVA];

/** Which of the fluids still need creating, given the keys already in the table. */
export function planFluids(existingKeys: readonly string[]): { create: NewFluid[]; skip: NewFluid[] } {
  const have = new Set(existingKeys);
  return { create: NEW_FLUIDS.filter((f) => !have.has(f.typeKey)), skip: NEW_FLUIDS.filter((f) => have.has(f.typeKey)) };
}

const json = (value: unknown) => (value == null ? Prisma.JsonNull : (value as Prisma.InputJsonValue));

async function main() {
  const apply = process.argv.includes('--apply');
  for (const fluid of NEW_FLUIDS) {
    const errors = validateFluid(fluid);
    if (errors.length > 0) throw new Error(`${fluid.typeKey} is invalid: ${errors.join('; ')}`);
  }
  const prisma = new PrismaClient();
  try {
    const existing = await prisma.fluid.findMany({ select: { typeKey: true } });
    const plan = planFluids(existing.map((f) => f.typeKey));
    for (const f of plan.create) console.log(`Fluid ${f.typeKey}: will be created`);
    for (const f of plan.skip) console.log(`Fluid ${f.typeKey}: exists, skipped`);
    const lavarock = await prisma.miningBlock.findUnique({ where: { typeKey: 'LAVAROCK' } });
    if (!lavarock) console.log('Warning: block LAVAROCK does not exist yet (run add-lavarock.ts); lava will not harden until it does.');
    if (!apply) {
      console.log('Dry run. Re-run with --apply to write.');
      return;
    }
    for (const f of plan.create) {
      await prisma.fluid.create({
        data: {
          id: f.id, typeKey: f.typeKey, name: f.name, description: f.description, color: f.color, opacity: f.opacity,
          density: f.density, viscosity: f.viscosity, flowRate: f.flowRate, minLevel: f.minLevel, flowThreshold: f.flowThreshold,
          appearance: json(f.appearance), flammability: json(f.flammability), generation: json(f.generation),
          contact: json(f.contact), light: json(f.light), reactions: json(f.reactions),
        },
      });
    }
    console.log('Done. Restart the server (or save any fluid in the admin) to load them.');
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
