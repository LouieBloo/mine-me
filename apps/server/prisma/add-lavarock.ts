/**
 * One-off, idempotent data script for Lavarock, the block water leaves behind when it cools lava (ticket 076).
 * Creates, only if missing, a "Lavarock" mining block (typeKey LAVAROCK): solid, hard to mine, drops nothing
 * (the drop table is edited in the admin). Its texture starts as the Rock texture and is replaced from the
 * admin Blocks page once the art exists (ticket 080). Nothing existing is changed.
 *
 *   npx tsx prisma/add-lavarock.ts           # dry run: prints what it would do
 *   npx tsx prisma/add-lavarock.ts --apply   # does it
 */
import { PrismaClient } from '@prisma/client';

export const LAVAROCK_BLOCK_ID = 'block_lavarock';
export const LAVAROCK_TYPE_KEY = 'LAVAROCK';
/** Much tougher than dirt (100) and any ore (silverium is 400). */
export const LAVAROCK_HEALTH = 500;
/** Stand-in until the real texture is uploaded. */
export const LAVAROCK_PLACEHOLDER_TEXTURE = '/assets/mining/block_rock-block.jpg';

/**
 * Pick power 0 because no tool in the game has a Pick Power effect yet; raise it in the admin once one does.
 */
export const lavarockBlockData = () => ({
  id: LAVAROCK_BLOCK_ID,
  typeKey: LAVAROCK_TYPE_KEY,
  name: 'Lavarock',
  description: 'Lava cooled solid by water. Hard, dark and slow to dig through.',
  textureUrl: LAVAROCK_PLACEHOLDER_TEXTURE,
  health: LAVAROCK_HEALTH,
  requiredPickPower: 0,
  staminaCost: 2,
});

async function main() {
  const apply = process.argv.includes('--apply');
  const prisma = new PrismaClient();
  try {
    const block = await prisma.miningBlock.findUnique({ where: { typeKey: LAVAROCK_TYPE_KEY } });
    console.log('Block LAVAROCK:', block ? 'exists, skipped' : 'will be created');
    if (!apply) {
      console.log('Dry run. Re-run with --apply to write.');
      return;
    }
    if (!block) await prisma.miningBlock.create({ data: lavarockBlockData() });
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
