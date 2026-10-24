/**
 * One-off data script for ticket 141: removes the retired blocks Bridge, Chest, Mineral and Entrance. Deletes their
 * `MiningBlock` rows (their drop tables go with them) and takes their keys out of every biome's block palette (weights
 * and swaps), which would otherwise name a block that no longer exists. Nothing else is changed.
 *
 *   npx tsx prisma/remove-retired-blocks.ts           # dry run: prints what it would do
 *   npx tsx prisma/remove-retired-blocks.ts --apply   # does it
 */
import { PrismaClient } from '@prisma/client';

export const RETIRED_BLOCK_KEYS: readonly string[] = ['BRIDGE', 'CHEST', 'MINERAL', 'ENTRANCE'];

interface PaletteLike {
  weights?: Record<string, unknown>;
  swaps?: Array<{ from: string; to: string }>;
}

/** The palette without the retired keys: their weights and every swap from or to them. Returns null when nothing changes. */
export function stripRetiredFromPalette<T extends PaletteLike>(palette: T | null | undefined): T | null {
  if (!palette) return null;
  const weights = Object.fromEntries(Object.entries(palette.weights ?? {}).filter(([key]) => !RETIRED_BLOCK_KEYS.includes(key)));
  const swaps = (palette.swaps ?? []).filter((s) => !RETIRED_BLOCK_KEYS.includes(s.from) && !RETIRED_BLOCK_KEYS.includes(s.to));
  const changed = Object.keys(weights).length !== Object.keys(palette.weights ?? {}).length || swaps.length !== (palette.swaps ?? []).length;
  if (!changed) return null;
  return { ...palette, ...(palette.weights ? { weights } : {}), ...(palette.swaps ? { swaps } : {}) };
}

async function main() {
  const apply = process.argv.includes('--apply');
  const prisma = new PrismaClient();
  try {
    const blocks = await prisma.miningBlock.findMany({ where: { typeKey: { in: [...RETIRED_BLOCK_KEYS] } }, select: { id: true, typeKey: true } });
    for (const key of RETIRED_BLOCK_KEYS) console.log(`Block ${key}:`, blocks.some((b) => b.typeKey === key) ? 'will be deleted' : 'not in the database, skipped');

    const biomes = await prisma.biome.findMany({ select: { id: true, key: true, blockPalette: true } });
    const edits = biomes.flatMap((b) => {
      const next = stripRetiredFromPalette(b.blockPalette as PaletteLike | null);
      return next ? [{ id: b.id, key: b.key, next }] : [];
    });
    for (const e of edits) console.log(`Biome ${e.key}: retired keys will be taken out of its block palette`);
    if (edits.length === 0) console.log('No biome names a retired block.');

    if (!apply) {
      console.log('Dry run. Re-run with --apply to write.');
      return;
    }
    for (const e of edits) await prisma.biome.update({ where: { id: e.id }, data: { blockPalette: e.next as object } });
    await prisma.miningBlock.deleteMany({ where: { typeKey: { in: [...RETIRED_BLOCK_KEYS] } } });
    console.log('Done. Restart the server (or save any block in the admin) to load the change.');
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
