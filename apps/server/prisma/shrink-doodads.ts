/**
 * One-off data script (ticket 145): the first doodads were too big next to a 2.7-block-tall character. This sets smaller
 * footprints (and size variants) for them. The picture is fitted inside the footprint keeping its shape, so the art needs no
 * change. It overwrites width, height and size variants of the keys listed, so run it once; later admin tweaks are kept
 * because a doodad that already has its new size is skipped.
 *
 *   npx tsx prisma/shrink-doodads.ts           # dry run: prints what it would do
 *   npx tsx prisma/shrink-doodads.ts --apply   # does it
 */
import { Prisma, PrismaClient } from '@prisma/client';

export interface SizeSet {
  width: number;
  height: number;
  /** The sizes picked at random per placement (weights); the first is the usual one. */
  variants: { width: number; height: number; weight: number }[] | null;
}

/** New sizes in small blocks. The usual size is about 2/3 of the old one and the rare big one is the old size. */
export const SMALLER_SIZES: Readonly<Record<string, SizeSet>> = {
  stalactite: { width: 1, height: 2, variants: [{ width: 1, height: 2, weight: 4 }, { width: 2, height: 3, weight: 1 }] },
  stalagmite: { width: 1, height: 2, variants: [{ width: 1, height: 2, weight: 4 }, { width: 2, height: 3, weight: 1 }] },
  dripping_stalactite: { width: 1, height: 2, variants: null },
  glow_crystal: { width: 1, height: 2, variants: [{ width: 1, height: 2, weight: 3 }, { width: 2, height: 3, weight: 1 }] },
  cave_mushroom: { width: 1, height: 1, variants: [{ width: 1, height: 1, weight: 4 }, { width: 2, height: 2, weight: 1 }] },
  glow_mushroom: { width: 1, height: 1, variants: [{ width: 1, height: 1, weight: 4 }, { width: 2, height: 2, weight: 1 }] },
  icicle: { width: 1, height: 2, variants: [{ width: 1, height: 2, weight: 3 }, { width: 1, height: 3, weight: 1 }] },
  wall_moss: { width: 1, height: 2, variants: [{ width: 1, height: 2, weight: 2 }, { width: 1, height: 1, weight: 1 }] },
  lava_vent: { width: 2, height: 1, variants: null },
  grass_tuft: { width: 1, height: 1, variants: [{ width: 1, height: 1, weight: 5 }, { width: 2, height: 2, weight: 1 }] },
};

type Row = { key: string; width: number; height: number; sizeVariants: unknown };

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** What the script does for each key: change a doodad that is not at its new size, skip one that is, note a missing one. */
export function planSizes(rows: readonly Row[], wanted: Readonly<Record<string, SizeSet>> = SMALLER_SIZES) {
  return Object.entries(wanted).map(([key, size]) => {
    const row = rows.find((r) => r.key === key);
    if (!row) return { key, action: 'missing' as const, size };
    const done = row.width === size.width && row.height === size.height && same(row.sizeVariants, size.variants);
    return { key, action: done ? ('skip' as const) : ('set' as const), size };
  });
}

async function main() {
  const apply = process.argv.includes('--apply');
  const prisma = new PrismaClient();
  try {
    const rows = await prisma.doodad.findMany({ select: { key: true, width: true, height: true, sizeVariants: true } });
    const plan = planSizes(rows);
    for (const p of plan) console.log(`Doodad ${p.key}: ${p.action === 'set' ? `size set to ${p.size.width}x${p.size.height}${p.size.variants ? ` with ${p.size.variants.length} variants` : ''}` : p.action === 'skip' ? 'already at the new size' : 'does not exist, skipped'}`);
    if (!apply) {
      console.log('Dry run. Re-run with --apply to write.');
      return;
    }
    for (const p of plan) {
      if (p.action !== 'set') continue;
      await prisma.doodad.update({
        where: { key: p.key },
        data: { width: p.size.width, height: p.size.height, sizeVariants: p.size.variants ? (p.size.variants as unknown as Prisma.InputJsonValue) : Prisma.JsonNull },
      });
    }
    console.log('Done. Restart the server (or save any doodad in the admin) to load them.');
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
