/**
 * One-off, idempotent data script (ticket 145): a biome's dirt is swapped completely (a 0.6-0.9 chance left loose dirt blocks
 * scattered through it, a checkerboard; only a border between biomes should mix), and oil is no longer common in a normal
 * mine: its base share drops and the default biome has none, so it collects in the biomes that ask for it (oil shale,
 * sandstone, magma) and only forms deeper in the mine. Maps and objectives that want oil can raise it later. Only values that differ are written.
 *
 *   npx tsx prisma/tune-biomes-and-oil.ts           # dry run: prints what it would do
 *   npx tsx prisma/tune-biomes-and-oil.ts --apply   # does it
 */
import { Prisma, PrismaClient } from '@prisma/client';

/** The share of the map oil pools take where a biome does not change it (it was 10). */
export const OIL_BASE_PERCENTAGE = 3;
/** The shallowest row oil pools form at, in small blocks (10 original blocks down; it was 6, which was raised for testing). */
export const OIL_MIN_DEPTH = 30;

interface Swap { from: string; to: string; chance?: number }
interface BlockPalette { swaps?: Swap[]; weights?: Record<string, number> }

/** The palette with every DIRT swap at a full chance (other swaps are untouched). Returns null when nothing changes. */
export function withFullDirtSwaps(palette: BlockPalette | null | undefined): BlockPalette | null {
  const swaps = palette?.swaps;
  if (!palette || !swaps?.some((s) => s.from === 'DIRT' && (s.chance ?? 1) !== 1)) return null;
  return { ...palette, swaps: swaps.map((s) => (s.from === 'DIRT' ? { ...s, chance: 1 } : s)) };
}

/** The default biome's fluid weights with oil at none. Returns null when it already has none. */
export function withoutOil(weights: Record<string, number> | null | undefined): Record<string, number> | null {
  return weights?.OIL === 0 ? null : { ...(weights ?? {}), OIL: 0 };
}

export interface TunePlan {
  biomePalettes: { key: string; blockPalette: BlockPalette }[];
  defaultOil: { key: string; fluidWeights: Record<string, number> } | null;
  oil: { id: string; generation: Record<string, unknown> } | null;
}

export function planTune(
  biomes: ReadonlyArray<{ key: string; isDefault: boolean; blockPalette: unknown; fluidWeights: unknown }>,
  fluids: ReadonlyArray<{ id: string; typeKey: string; generation: unknown }>
): TunePlan {
  const biomePalettes = biomes.flatMap((b) => {
    const blockPalette = withFullDirtSwaps(b.blockPalette as BlockPalette | null);
    return blockPalette ? [{ key: b.key, blockPalette }] : [];
  });
  const def = biomes.find((b) => b.isDefault);
  const fluidWeights = def ? withoutOil(def.fluidWeights as Record<string, number> | null) : null;
  const oilFluid = fluids.find((f) => f.typeKey === 'OIL');
  const gen = (oilFluid?.generation ?? null) as Record<string, unknown> | null;
  const tooCommon = typeof gen?.percentage === 'number' && gen.percentage > OIL_BASE_PERCENTAGE;
  const tooShallow = typeof gen?.minDepth === 'number' && gen.minDepth < OIL_MIN_DEPTH;
  const oil = oilFluid && gen && (tooCommon || tooShallow)
    ? { id: oilFluid.id, generation: { ...gen, ...(tooCommon ? { percentage: OIL_BASE_PERCENTAGE } : {}), ...(tooShallow ? { minDepth: OIL_MIN_DEPTH } : {}) } }
    : null;
  return { biomePalettes, defaultOil: def && fluidWeights ? { key: def.key, fluidWeights } : null, oil };
}

async function main() {
  const apply = process.argv.includes('--apply');
  const prisma = new PrismaClient();
  try {
    const biomes = await prisma.biome.findMany({ select: { key: true, isDefault: true, blockPalette: true, fluidWeights: true } });
    const fluids = await prisma.fluid.findMany({ select: { id: true, typeKey: true, generation: true } });
    const plan = planTune(biomes, fluids);
    for (const b of plan.biomePalettes) console.log(`Biome ${b.key}: dirt swap set to a full chance`);
    if (plan.defaultOil) console.log(`Biome ${plan.defaultOil.key} (default): oil weight set to 0`);
    if (plan.oil) console.log(`Oil: base share at most ${OIL_BASE_PERCENTAGE}%, from depth ${OIL_MIN_DEPTH} down`);
    if (!plan.biomePalettes.length && !plan.defaultOil && !plan.oil) console.log('Nothing to change.');
    if (!apply) {
      console.log('Dry run. Re-run with --apply to write.');
      return;
    }
    for (const b of plan.biomePalettes) await prisma.biome.update({ where: { key: b.key }, data: { blockPalette: b.blockPalette as unknown as Prisma.InputJsonValue } });
    if (plan.defaultOil) await prisma.biome.update({ where: { key: plan.defaultOil.key }, data: { fluidWeights: plan.defaultOil.fluidWeights } });
    if (plan.oil) await prisma.fluid.update({ where: { id: plan.oil.id }, data: { generation: plan.oil.generation as Prisma.InputJsonValue } });
    console.log('Done. Restart the server (or save anything in the admin) to load them.');
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
