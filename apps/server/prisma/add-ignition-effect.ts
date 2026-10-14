/**
 * One-off, idempotent data script (ticket 056): adds the "Ignites" effect and gives it to the items that
 * should set oil alight today: the Dynamite (its fuse sparks and blast), the Flame Pickaxe (its flame) and the
 * Torch (a placed torch lights the oil it touches, ticket 064).
 *
 *  1. Creates the "Ignites" effect (the `ignites` flag) if it does not exist.
 *  2. Attaches it to each listed item that exists and does not already have it, at strength 100 (%).
 *
 * Nothing else is touched; an item that already has the effect (maybe tuned in the admin) is left alone.
 *
 *   npx tsx prisma/add-ignition-effect.ts           # dry run
 *   npx tsx prisma/add-ignition-effect.ts --apply   # does it
 */
import { PrismaClient } from '@prisma/client';

export const IGNITES_EFFECT_NAME = 'Ignites';
export const IGNITING_ITEM_NAMES = ['Dynamite', 'Flame Pickaxe', 'Torch'];
export const DEFAULT_STRENGTH = 100;

export interface ItemAttachment {
  name: string;
  /** Item row id, if the item exists. */
  itemId?: string;
  action: 'attach' | 'skip-has-effect' | 'skip-missing';
}

export interface IgnitionPlan {
  createEffect: boolean;
  items: ItemAttachment[];
}

/** What to do, given what is in the database. Never overwrites an existing effect or attachment. */
export function planIgnition(
  effectExists: boolean,
  items: Array<{ id: string; name: string; hasIgnitesEffect: boolean }>,
  wanted: readonly string[] = IGNITING_ITEM_NAMES
): IgnitionPlan {
  return {
    createEffect: !effectExists,
    items: wanted.map((name): ItemAttachment => {
      const item = items.find((i) => i.name === name);
      if (!item) return { name, action: 'skip-missing' };
      return { name, itemId: item.id, action: item.hasIgnitesEffect ? 'skip-has-effect' : 'attach' };
    }),
  };
}

async function main() {
  const apply = process.argv.includes('--apply');
  const prisma = new PrismaClient();
  try {
    const effect = await prisma.effect.findUnique({ where: { name: IGNITES_EFFECT_NAME } });
    const rows = await prisma.item.findMany({
      where: { name: { in: IGNITING_ITEM_NAMES } },
      include: { itemEffects: { include: { effect: true } } },
    });
    const plan = planIgnition(
      Boolean(effect),
      rows.map((r) => ({ id: r.id, name: r.name, hasIgnitesEffect: r.itemEffects.some((e) => e.effect.ignites) }))
    );

    console.log(`Effect "${IGNITES_EFFECT_NAME}":`, plan.createEffect ? 'will be created' : 'exists');
    for (const item of plan.items) console.log(`  ${item.name}:`, { attach: 'will get the effect', 'skip-has-effect': 'already ignites, skipped', 'skip-missing': 'not found, skipped' }[item.action]);
    if (!apply) {
      console.log('Dry run. Re-run with --apply to write.');
      return;
    }

    const ignites =
      effect ??
      (await prisma.effect.create({
        data: {
          name: IGNITES_EFFECT_NAME,
          description: 'Sets flammable things alight. The value is the strength in percent (100 = the material\'s own ignition chance).',
          ignites: true,
        },
      }));
    for (const item of plan.items) {
      if (item.action === 'attach' && item.itemId) {
        await prisma.objectEffects.create({ data: { itemId: item.itemId, effectId: ignites.id, value: DEFAULT_STRENGTH } });
      }
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
