/**
 * One-off, idempotent data script for the Bridge. Creates, only if missing, a "Bridge" consumable item (subType BRIDGE,
 * hold-to-place). Its sprite and icon are uploaded later in the admin. The tile it turns into has no block row of its
 * own (ticket 141): its art comes from the item, and mining a placed bridge gives the item back.
 *
 * Nothing existing is changed (unlike `prisma db seed`). Fixed ids keep `packages/shared/src/data/*.json` identical to the DB rows.
 *
 *   npx tsx prisma/add-bridge.ts           # dry run: prints what it would do
 *   npx tsx prisma/add-bridge.ts --apply   # does it
 */
import { PrismaClient } from '@prisma/client';

export const BRIDGE_ITEM_ID = 'item_bridge';

export const bridgeItemData = () => ({
  id: BRIDGE_ITEM_ID,
  itemKey: 'bridge',
  name: 'Bridge',
  description: 'A sturdy plank to lay across a gap. Walk on it, build with it. Mine it to take it back.',
  type: 'CONSUMABLE' as const,
  subType: 'BRIDGE',
  rarity: 'LOW' as const,
  triggerMode: 'HOLD' as const,
});

async function main() {
  const apply = process.argv.includes('--apply');
  const prisma = new PrismaClient();
  try {
    const item = await prisma.item.findFirst({ where: { OR: [{ id: BRIDGE_ITEM_ID }, { itemKey: 'bridge' }] } });
    console.log('Item "Bridge":', item ? 'exists, skipped' : 'will be created');
    if (!apply) {
      console.log('Dry run. Re-run with --apply to write.');
      return;
    }

    if (!item) await prisma.item.create({ data: bridgeItemData() });
    console.log('Done. Restart the server (or save any item in the admin) to load it.');
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
