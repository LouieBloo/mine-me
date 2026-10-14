/**
 * One-off, idempotent data script for the Flame Pickaxe (ticket 049). Creates, only if missing:
 *
 *  1. A "Flame" particle effect (continuous, rising orange-to-red flame).
 *  2. A "Flame Pickaxe" item: a copy of the Basic Pickaxe's stats and swing sound with Mining Speed
 *     raised 4x, rarity MEDIUM, the Flame as its held particle effect, and no sprite (uploaded later).
 *
 * Nothing existing is changed (unlike `prisma db seed`). Both rows can be edited in the admin afterwards.
 *
 *   npx tsx prisma/add-flame-pickaxe.ts           # dry run: prints what it would do
 *   npx tsx prisma/add-flame-pickaxe.ts --apply   # does it
 */
import { PrismaClient, Prisma } from '@prisma/client';

export const FLAME_EFFECT_NAME = 'Flame';
export const FLAME_PICKAXE_NAME = 'Flame Pickaxe';
export const BASE_PICKAXE_NAME = 'Basic Pickaxe';
export const SPEED_MULTIPLIER = 4;

export const FLAME_EFFECT_CONFIG = {
  emitterType: 'continuous',
  rate: 45,
  lifetime: { min: 0.35, max: 0.8 },
  speed: { min: 25, max: 70 },
  angle: { min: 250, max: 290 },
  gravity: { x: 0, y: -40 },
  friction: 0.97,
  scale: { start: 1.6, end: 0.2 },
  color: { start: '#ffd23f', end: '#e11d1d' },
  alpha: { start: 0.9, end: 0 },
  blendMode: 'add',
  shape: 'flame',
  turbulence: 18,
  spawnRadius: 6,
};

export interface EffectRow {
  effectId: string;
  value: number;
  isMiningSpeed: boolean;
}

/** The base item's effects with the mining-speed ones multiplied. */
export function scaleEffects(effects: EffectRow[], multiplier: number): { effectId: string; value: number }[] {
  return effects.map((e) => ({ effectId: e.effectId, value: e.isMiningSpeed ? e.value * multiplier : e.value }));
}

async function main() {
  const apply = process.argv.includes('--apply');
  const prisma = new PrismaClient();
  try {
    const base = await prisma.item.findFirst({
      where: { name: BASE_PICKAXE_NAME },
      include: { itemEffects: { include: { effect: true } } },
    });
    if (!base) throw new Error(`"${BASE_PICKAXE_NAME}" not found; nothing to copy from`);

    const existingItem = await prisma.item.findFirst({ where: { name: FLAME_PICKAXE_NAME } });
    const existingEffect = await prisma.particleEffect.findUnique({ where: { name: FLAME_EFFECT_NAME } });

    const effects = scaleEffects(
      base.itemEffects.map((ie) => ({ effectId: ie.effectId, value: ie.value, isMiningSpeed: ie.effect.miningSpeedModifier })),
      SPEED_MULTIPLIER
    );
    console.log(`Particle effect "${FLAME_EFFECT_NAME}":`, existingEffect ? 'exists, skipped' : 'will be created');
    console.log(`Item "${FLAME_PICKAXE_NAME}":`, existingItem ? 'exists, skipped' : 'will be created');
    console.log('  effects:', JSON.stringify(effects));
    if (!apply) {
      console.log('Dry run. Re-run with --apply to write.');
      return;
    }

    const effect =
      existingEffect ??
      (await prisma.particleEffect.create({
        data: {
          name: FLAME_EFFECT_NAME,
          description: 'Rising flame for items that are on fire while held.',
          type: 'CONTINUOUS',
          config: FLAME_EFFECT_CONFIG as unknown as Prisma.InputJsonValue,
        },
      }));

    if (!existingItem) {
      await prisma.item.create({
        data: {
          name: FLAME_PICKAXE_NAME,
          description: 'A pickaxe wreathed in flame. Mines four times as fast as a basic pickaxe.',
          type: base.type,
          subType: base.subType,
          rarity: 'MEDIUM',
          triggerMode: base.triggerMode,
          soundEffectUrl: base.soundEffectUrl,
          soundEffects: base.soundEffects ?? Prisma.JsonNull,
          inGameScale: base.inGameScale,
          heldParticleEffectId: effect.id,
          itemEffects: { create: effects },
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
