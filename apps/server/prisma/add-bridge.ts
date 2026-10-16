/**
 * One-off, idempotent data script for the Bridge. Creates, only if missing:
 *
 *  1. A "Bridge" consumable item (subType BRIDGE, hold-to-place). Its sprite and icon are uploaded later in the admin.
 *  2. A "Bridge" mining block (typeKey BRIDGE): the tile the item turns into. It has its own health, sounds and
 *     texture in the admin Blocks page like any other block.
 *  3. The block's drop table: mining a placed bridge gives the item back.
 *
 * Nothing existing is changed (unlike `prisma db seed`). Fixed ids keep `packages/shared/src/data/*.json` identical to the DB rows.
 *
 *   npx tsx prisma/add-bridge.ts           # dry run: prints what it would do
 *   npx tsx prisma/add-bridge.ts --apply   # does it
 */
import { PrismaClient } from '@prisma/client';

export const BRIDGE_ITEM_ID = 'item_bridge';
export const BRIDGE_BLOCK_ID = 'block_bridge';
export const BRIDGE_TYPE_KEY = 'BRIDGE';
/** Breaks in one hit of any tool. */
export const BRIDGE_BLOCK_HEALTH = 20;

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

export const bridgeBlockData = () => ({
  id: BRIDGE_BLOCK_ID,
  typeKey: BRIDGE_TYPE_KEY,
  name: 'Bridge',
  description: 'A placed bridge. Solid from every side.',
  health: BRIDGE_BLOCK_HEALTH,
  requiredPickPower: 0,
  staminaCost: 1,
});

/** Mining a bridge always gives exactly one bridge back. */
export const bridgeDropEntry = () => ({ itemId: BRIDGE_ITEM_ID, chance: 100, minQuantity: 1, maxQuantity: 1 });

async function main() {
  const apply = process.argv.includes('--apply');
  const prisma = new PrismaClient();
  try {
    const item = await prisma.item.findFirst({ where: { OR: [{ id: BRIDGE_ITEM_ID }, { itemKey: 'bridge' }] } });
    const block = await prisma.miningBlock.findUnique({ where: { typeKey: BRIDGE_TYPE_KEY }, include: { dropTable: true } });
    console.log('Item "Bridge":', item ? 'exists, skipped' : 'will be created');
    console.log('Block BRIDGE:', block ? 'exists, skipped' : 'will be created');
    console.log('Drop table:', block?.dropTable ? 'exists, skipped' : 'will be created (100% one Bridge)');
    if (!apply) {
      console.log('Dry run. Re-run with --apply to write.');
      return;
    }

    const itemId = item?.id ?? (await prisma.item.create({ data: bridgeItemData() })).id;
    const blockRow = block ?? (await prisma.miningBlock.create({ data: bridgeBlockData() }));
    if (!block?.dropTable) {
      await prisma.dropTable.create({
        data: { miningBlockId: blockRow.id, items: { create: [{ ...bridgeDropEntry(), itemId }] } },
      });
    }
    console.log('Done. Restart the server (or save any block in the admin) to load it.');
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
