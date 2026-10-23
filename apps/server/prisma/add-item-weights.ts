/**
 * One-off, idempotent data script (ticket 117): gives existing items a weight and creates the "Carry Capacity" effect.
 *
 *  1. Creates the "Carry Capacity" effect (the `carryCapacityModifier` flag) if it does not exist. Nothing is
 *     attached to any item: the base capacity (100) is in the shared `BASE_CARRY_CAPACITY`; bags and gear get the
 *     effect later in the admin.
 *  2. Proposes a weight for every item whose weight is still 0 and writes it on --apply. A weight set in the admin
 *     (anything above 0) is never overwritten. Items proposed as 0 (gear, currency) stay at 0.
 *
 * Scale: small whole numbers against a base capacity of about 100 (dirt 1, stone 2, ore 3-5, gems 1-2).
 *
 *   npx tsx prisma/add-item-weights.ts           # dry run
 *   npx tsx prisma/add-item-weights.ts --apply   # does it
 */
import { PrismaClient } from '@prisma/client';

export const CARRY_CAPACITY_EFFECT_NAME = 'Carry Capacity';

/** Weights for specific items (by key, else by name), checked before the type rules. */
export const WEIGHT_BY_KEY: Readonly<Record<string, number>> = {
  copperium: 3,
  silverium: 4,
  solium: 5,
  lumber: 2,
  gun_bullet: 0.1,
};

/** Fallback by type, then subtype. */
export const WEIGHT_BY_SUBTYPE: Readonly<Record<string, number>> = {
  MINERAL: 4,
  LUMBER: 2,
  HERB: 1,
  AGRICULTURE: 1,
  POTION: 1,
  FOOD: 1,
  TORCH: 1,
  LADDER: 2,
  BRIDGE: 2,
  DYNAMITE: 3,
  OTHER: 1,
};

export interface WeightInput {
  name: string;
  itemKey: string | null;
  type: string;
  subType: string;
  weight: number;
}

/** The weight proposed for an item (0 for gear and currency, which are carried equipped or not at all). */
export function proposeWeight(item: Pick<WeightInput, 'name' | 'itemKey' | 'type' | 'subType'>): number {
  const keyed = WEIGHT_BY_KEY[item.itemKey ?? item.name.toLowerCase()];
  if (keyed !== undefined) return keyed;
  if (item.type === 'GEAR' || item.type === 'CURRENCY') return 0;
  return WEIGHT_BY_SUBTYPE[item.subType] ?? 1;
}

export interface WeightChange {
  name: string;
  from: number;
  to: number;
}

/** Items that get a new weight: only those still at 0 whose proposal is above 0. */
export function planWeights(items: readonly WeightInput[]): WeightChange[] {
  return items
    .filter((item) => !(item.weight > 0))
    .map((item) => ({ name: item.name, from: item.weight, to: proposeWeight(item) }))
    .filter((change) => change.to > 0);
}

async function main() {
  const apply = process.argv.includes('--apply');
  const prisma = new PrismaClient();
  try {
    const effect = await prisma.effect.findUnique({ where: { name: CARRY_CAPACITY_EFFECT_NAME } });
    const items = await prisma.item.findMany({ select: { id: true, name: true, itemKey: true, type: true, subType: true, weight: true } });
    const changes = planWeights(items);

    console.log(`Effect "${CARRY_CAPACITY_EFFECT_NAME}":`, effect ? 'exists' : 'will be created');
    for (const change of changes) console.log(`  ${change.name}: weight ${change.from} -> ${change.to}`);
    console.log(`${changes.length} of ${items.length} items change; the rest keep their weight.`);
    if (!apply) {
      console.log('Dry run. Re-run with --apply to write.');
      return;
    }

    if (!effect) {
      await prisma.effect.create({
        data: {
          name: CARRY_CAPACITY_EFFECT_NAME,
          description: 'Adds to the backpack weight limit. The value is the extra capacity in weight units.',
          carryCapacityModifier: true,
        },
      });
    }
    for (const change of changes) {
      const item = items.find((i) => i.name === change.name);
      if (item) await prisma.item.update({ where: { id: item.id }, data: { weight: change.to } });
    }
    console.log('Done. Restart the server (or save any item in the admin) so the new weights load.');
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
