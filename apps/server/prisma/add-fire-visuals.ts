/**
 * One-off, idempotent data script (ticket 061): gives fire something to look like.
 *
 *  1. Creates the "Oil Fire" particle effect (flames rising from a burning cell) and the "Burning" particle
 *     effect (flames on a burning player or mob), each only if it does not exist.
 *  2. Points Oil's flammability at "Oil Fire" and gives it a flickering flame light, each only if Oil has none yet.
 *  3. Sets the active mine config's burning effect to "Burning", only if it has none.
 *
 * Anything already set (maybe tuned in the admin) is left alone.
 *
 *   npx tsx prisma/add-fire-visuals.ts           # dry run
 *   npx tsx prisma/add-fire-visuals.ts --apply   # does it
 */
import { PrismaClient, Prisma } from '@prisma/client';
import type { Flammability, ItemLightConfig } from '@mine-me/shared';

export const OIL_FIRE_NAME = 'Oil Fire';
export const BURNING_NAME = 'Burning';
export const OIL_TYPE_KEY = 'OIL';

/** Flames across a whole cell: wide, tall licks that rise from the oil's surface. */
export const OIL_FIRE_CONFIG = {
  emitterType: 'continuous',
  rate: 38,
  lifetime: { min: 0.4, max: 0.9 },
  speed: { min: 14, max: 46 },
  angle: { min: 255, max: 285 },
  gravity: { x: 0, y: -34 },
  friction: 0.97,
  scale: { start: 1.0, end: 0.15 },
  color: { start: '#ffd23f', end: '#c2310f' },
  alpha: { start: 0.9, end: 0 },
  blendMode: 'add',
  shape: 'flame',
  turbulence: 14,
  spawnWidth: 52,
  spawnHeight: 4,
};

/** Flames wrapped round a body that is on fire. */
export const BURNING_CONFIG = {
  emitterType: 'continuous',
  rate: 34,
  lifetime: { min: 0.3, max: 0.7 },
  speed: { min: 8, max: 34 },
  angle: { min: 250, max: 290 },
  gravity: { x: 0, y: -30 },
  friction: 0.96,
  scale: { start: 0.8, end: 0.1 },
  color: { start: '#ffe066', end: '#d6401a' },
  alpha: { start: 0.9, end: 0 },
  blendMode: 'add',
  shape: 'flame',
  turbulence: 12,
  spawnWidth: 26,
  spawnHeight: 40,
};

/** A warm, flickering light for each burning cell. */
export const OIL_FLAME_LIGHT: ItemLightConfig = {
  enabled: true,
  type: 'POINT',
  effect: 'FLICKER',
  color: '#ff7a1c',
  radius: 3.2,
  intensity: 0.75,
  flickerSpeed: 11,
  flickerAmount: 0.22,
};

export interface FireVisualsPlan {
  createOilFire: boolean;
  createBurning: boolean;
  setOilEffect: boolean;
  setOilLight: boolean;
  setBurningEffect: boolean;
}

/** What to change, without overwriting anything that is already set. */
export function planFireVisuals(state: {
  oilFireExists: boolean;
  burningExists: boolean;
  oil: { flammability: Partial<Flammability> | null } | null;
  mapConfig: { burningEffectId: string | null } | null;
}): FireVisualsPlan {
  const flammability = state.oil?.flammability ?? null;
  return {
    createOilFire: !state.oilFireExists,
    createBurning: !state.burningExists,
    setOilEffect: Boolean(flammability) && !flammability!.flameEffectId,
    setOilLight: Boolean(flammability) && !flammability!.flameLight,
    setBurningEffect: Boolean(state.mapConfig) && !state.mapConfig!.burningEffectId,
  };
}

async function main() {
  const apply = process.argv.includes('--apply');
  const prisma = new PrismaClient();
  try {
    const [oilFire, burning, oil, mapConfig] = await Promise.all([
      prisma.particleEffect.findUnique({ where: { name: OIL_FIRE_NAME } }),
      prisma.particleEffect.findUnique({ where: { name: BURNING_NAME } }),
      prisma.fluid.findUnique({ where: { typeKey: OIL_TYPE_KEY } }),
      prisma.miningMapConfig.findFirst({ where: { isActive: true } }),
    ]);
    const plan = planFireVisuals({
      oilFireExists: Boolean(oilFire),
      burningExists: Boolean(burning),
      oil: oil ? { flammability: (oil.flammability as Partial<Flammability> | null) ?? null } : null,
      mapConfig: mapConfig ? { burningEffectId: (mapConfig as { burningEffectId?: string | null }).burningEffectId ?? null } : null,
    });

    const say = (flag: boolean, yes: string, no: string) => (flag ? yes : no);
    console.log(`Particle effect "${OIL_FIRE_NAME}":`, say(plan.createOilFire, 'will be created', 'exists'));
    console.log(`Particle effect "${BURNING_NAME}":`, say(plan.createBurning, 'will be created', 'exists'));
    console.log('Oil flame effect:', say(plan.setOilEffect, 'will be set', oil ? 'left as is' : 'Oil not found'));
    console.log('Oil flame light:', say(plan.setOilLight, 'will be set', oil ? 'left as is' : 'Oil not found'));
    console.log('Burning effect on the mine config:', say(plan.setBurningEffect, 'will be set', mapConfig ? 'left as is' : 'no active config'));
    if (!apply) {
      console.log('Dry run. Re-run with --apply to write.');
      return;
    }

    const oilFireRow =
      oilFire ??
      (await prisma.particleEffect.create({
        data: { name: OIL_FIRE_NAME, description: 'Flames rising from a burning cell of oil.', type: 'CONTINUOUS', config: OIL_FIRE_CONFIG as unknown as Prisma.InputJsonValue },
      }));
    const burningRow =
      burning ??
      (await prisma.particleEffect.create({
        data: { name: BURNING_NAME, description: 'Flames on a player or mob that is on fire.', type: 'CONTINUOUS', config: BURNING_CONFIG as unknown as Prisma.InputJsonValue },
      }));

    if (oil && (plan.setOilEffect || plan.setOilLight)) {
      const next = { ...((oil.flammability as object) ?? {}) } as Partial<Flammability>;
      if (plan.setOilEffect) next.flameEffectId = oilFireRow.id;
      if (plan.setOilLight) next.flameLight = OIL_FLAME_LIGHT;
      await prisma.fluid.update({ where: { id: oil.id }, data: { flammability: next as unknown as Prisma.InputJsonValue } });
    }
    if (mapConfig && plan.setBurningEffect) {
      await prisma.miningMapConfig.update({ where: { id: mapConfig.id }, data: { burningEffectId: burningRow.id } as never });
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
