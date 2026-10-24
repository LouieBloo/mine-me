/**
 * One-off, idempotent data script for the basic terrain blocks (ticket 140): Stone, Clay, Sandstone, Gravel, Ice and
 * Bedrock. Creates, only the ones that are missing, a `MiningBlock` row for each. They are plain solid blocks that
 * drop nothing (drop tables are edited in the admin) and start with the Rock texture until real art is uploaded
 * from the admin Blocks page. Biomes put them in the mine with block swaps. Nothing existing is changed.
 *
 *   npx tsx prisma/add-basic-blocks.ts           # dry run: prints what it would do
 *   npx tsx prisma/add-basic-blocks.ts --apply   # does it
 */
import { PrismaClient } from '@prisma/client';
import { MINING_TILE_DEFINITIONS, MiningTileType } from '@mine-me/shared';

/** Stand-in until the real textures are uploaded. */
export const BASIC_BLOCK_PLACEHOLDER_TEXTURE = '/assets/mining/block_rock-block.jpg';

interface BasicBlock {
  typeKey: 'STONE' | 'CLAY' | 'SANDSTONE' | 'GRAVEL' | 'ICE' | 'BEDROCK';
  name: string;
  description: string;
  staminaCost: number;
}

export const BASIC_BLOCKS: readonly BasicBlock[] = [
  { typeKey: 'STONE', name: 'Stone', description: 'Solid grey stone. The bulk of the deep mine.', staminaCost: 2 },
  { typeKey: 'CLAY', name: 'Clay', description: 'Soft, damp clay. Easy to dig.', staminaCost: 1 },
  { typeKey: 'SANDSTONE', name: 'Sandstone', description: 'Layered, crumbly sandstone.', staminaCost: 1 },
  { typeKey: 'GRAVEL', name: 'Gravel', description: 'Loose gravel. Very easy to dig.', staminaCost: 1 },
  { typeKey: 'ICE', name: 'Ice', description: 'Hard, clear ice.', staminaCost: 1 },
  { typeKey: 'BEDROCK', name: 'Bedrock', description: 'The unbreakable floor of the world.', staminaCost: 0 },
];

/**
 * The row for one block. Health comes from the tile definition (bedrock has none: it cannot be damaged). Pick power is 0
 * because no tool has a Pick Power effect yet; raise it in the admin once one does.
 */
export const basicBlockData = (block: BasicBlock) => ({
  id: `block_${block.typeKey.toLowerCase()}`,
  typeKey: block.typeKey,
  name: block.name,
  description: block.description,
  textureUrl: BASIC_BLOCK_PLACEHOLDER_TEXTURE,
  health: MINING_TILE_DEFINITIONS[MiningTileType[block.typeKey]].health ?? 0,
  requiredPickPower: 0,
  staminaCost: block.staminaCost,
});

async function main() {
  const apply = process.argv.includes('--apply');
  const prisma = new PrismaClient();
  try {
    const existing = await prisma.miningBlock.findMany({ where: { typeKey: { in: BASIC_BLOCKS.map((b) => b.typeKey) } }, select: { typeKey: true } });
    const have = new Set(existing.map((b) => b.typeKey));
    for (const block of BASIC_BLOCKS) console.log(`Block ${block.typeKey}:`, have.has(block.typeKey) ? 'exists, skipped' : 'will be created');
    if (!apply) {
      console.log('Dry run. Re-run with --apply to write.');
      return;
    }
    for (const block of BASIC_BLOCKS) {
      if (!have.has(block.typeKey)) await prisma.miningBlock.create({ data: basicBlockData(block) });
    }
    console.log('Done. Restart the server (or save any block in the admin) to load them.');
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
