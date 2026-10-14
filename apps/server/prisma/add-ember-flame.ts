/**
 * One-off, idempotent data script (ticket 050): adds a subtler, smaller flame particle effect
 * ("Ember Flame") and gives the Flame Pickaxe a held light.
 *
 *  1. Creates the "Ember Flame" particle effect if it does not exist.
 *  2. On the Flame Pickaxe: switches the held effect to it (only if the pickaxe still uses the first
 *     "Flame" effect or none) and adds a held torch-like light (only if it has none).
 *
 * Nothing else is touched. The first "Flame" effect stays in the library.
 *
 *   npx tsx prisma/add-ember-flame.ts           # dry run
 *   npx tsx prisma/add-ember-flame.ts --apply   # does it
 */
import { PrismaClient, Prisma } from '@prisma/client';
import type { HeldLightConfig } from '@mine-me/shared';

export const EMBER_FLAME_NAME = 'Ember Flame';
export const FIRST_FLAME_NAME = 'Flame';
export const FLAME_PICKAXE_NAME = 'Flame Pickaxe';

/** Small, low-rate flame: short licks that rise a little and fade, rather than a big blaze. */
export const EMBER_FLAME_CONFIG = {
  emitterType: 'continuous',
  rate: 14,
  lifetime: { min: 0.3, max: 0.6 },
  speed: { min: 6, max: 22 },
  angle: { min: 260, max: 280 },
  gravity: { x: 0, y: -22 },
  friction: 0.96,
  scale: { start: 0.55, end: 0.12 },
  color: { start: '#ffc857', end: '#d6401a' },
  alpha: { start: 0.85, end: 0 },
  blendMode: 'add',
  shape: 'flame',
  turbulence: 6,
  spawnRadius: 2,
};

/** A warm, gently flickering light about as strong as a torch. */
export const FLAME_HELD_LIGHT: HeldLightConfig = {
  enabled: true,
  type: 'POINT',
  effect: 'FLICKER',
  color: '#ff8a2a',
  radius: 3.5,
  intensity: 0.9,
  flickerSpeed: 9,
  flickerAmount: 0.18,
  offsetX: 0,
  offsetY: 0,
};

export interface PickaxePlan {
  setEffect: boolean;
  setLight: boolean;
}

/** What to change on the pickaxe, without overwriting anything the owner has since edited. */
export function planPickaxe(
  pickaxe: { heldParticleEffectId: string | null; heldLightConfig: unknown },
  firstFlameId: string | null
): PickaxePlan {
  return {
    setEffect: pickaxe.heldParticleEffectId === null || pickaxe.heldParticleEffectId === firstFlameId,
    setLight: pickaxe.heldLightConfig == null,
  };
}

async function main() {
  const apply = process.argv.includes('--apply');
  const prisma = new PrismaClient();
  try {
    const pickaxe = await prisma.item.findFirst({ where: { name: FLAME_PICKAXE_NAME } });
    if (!pickaxe) throw new Error(`"${FLAME_PICKAXE_NAME}" not found`);
    const existing = await prisma.particleEffect.findUnique({ where: { name: EMBER_FLAME_NAME } });
    const first = await prisma.particleEffect.findUnique({ where: { name: FIRST_FLAME_NAME } });
    const plan = planPickaxe(pickaxe, first?.id ?? null);

    console.log(`Particle effect "${EMBER_FLAME_NAME}":`, existing ? 'exists, skipped' : 'will be created');
    console.log(`Pickaxe held effect:`, plan.setEffect ? `will use "${EMBER_FLAME_NAME}"` : 'left as is (edited since)');
    console.log(`Pickaxe held light:`, plan.setLight ? 'will be added' : 'left as is (already set)');
    if (!apply) {
      console.log('Dry run. Re-run with --apply to write.');
      return;
    }

    const effect =
      existing ??
      (await prisma.particleEffect.create({
        data: {
          name: EMBER_FLAME_NAME,
          description: 'Small, subtle flame licks for items that glow while held.',
          type: 'CONTINUOUS',
          config: EMBER_FLAME_CONFIG as unknown as Prisma.InputJsonValue,
        },
      }));
    await prisma.item.update({
      where: { id: pickaxe.id },
      data: {
        ...(plan.setEffect ? { heldParticleEffectId: effect.id } : {}),
        ...(plan.setLight ? { heldLightConfig: FLAME_HELD_LIGHT as unknown as Prisma.InputJsonValue } : {}),
      },
    });
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
