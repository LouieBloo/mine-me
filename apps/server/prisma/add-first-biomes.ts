/**
 * One-off, idempotent data script (tickets 095-098): the first pass of biomes. Creates, only the ones that are missing,
 * a default biome and seven themed regions. They use the existing blocks, fluids and gases by key, and change only the
 * base blocks (swaps), how many pockets of fluid and gas are made, and the wall tint. Mob lists are left empty (the map's
 * usual mobs) and wall textures are added from the admin once there is art. Existing biomes (same key) are never touched.
 *
 * Depths are in small blocks: the mine is 135 rows deep (45 original blocks x BLOCK_SCALE).
 *
 *   npx tsx prisma/add-first-biomes.ts           # dry run: prints what it would do
 *   npx tsx prisma/add-first-biomes.ts --apply   # does it
 */
import { PrismaClient, Prisma } from '@prisma/client';
import { BLOCK_SCALE, DEFAULT_BIOME_KEY, DEFAULT_BIOME_NOISE_SCALE, validateBiome, type BiomeDefinition } from '@mine-me/shared';

const S = BLOCK_SCALE;

type NewBiome = Omit<BiomeDefinition, 'id' | 'createdAt' | 'updatedAt'>;

export const FIRST_BIOMES: readonly NewBiome[] = [
  {
    key: DEFAULT_BIOME_KEY,
    name: 'Earthen Mine',
    description: 'Plain dirt and rock: the mine as it always was. Fills wherever no other biome wins.',
    isDefault: true,
    minDepth: 0,
    maxDepth: null,
    weight: 1,
    noiseScale: DEFAULT_BIOME_NOISE_SCALE,
    fluidWeights: { OIL: 0 },
  },
  {
    key: 'clay_pits',
    name: 'Clay Pits',
    description: 'Soft, damp clay near the surface, with a lot of water pooled in it.',
    isDefault: false,
    minDepth: 0,
    maxDepth: 15 * S,
    weight: 1.5,
    noiseScale: 14 * S,
    blockPalette: { swaps: [{ from: 'DIRT', to: 'CLAY', chance: 1 }] },
    fluidWeights: { WATER: 2.5, OIL: 0.3, LAVA: 0 },
    ambient: { tint: '#8a5a3c' },
  },
  {
    key: 'sandstone_hollows',
    name: 'Sandstone Hollows',
    description: 'Dry layered sandstone. No water down here, and the gas pockets are thin.',
    isDefault: false,
    minDepth: 5 * S,
    maxDepth: 25 * S,
    weight: 1.4,
    noiseScale: 15 * S,
    blockPalette: {
      swaps: [
        { from: 'DIRT', to: 'SANDSTONE', chance: 1 },
        { from: 'ROCK', to: 'SANDSTONE', chance: 0.3 },
      ],
    },
    fluidWeights: { WATER: 0.1, OIL: 1.5 },
    gasWeights: { HYDROGEN: 0.3, NITROGEN: 0.5 },
    ambient: { tint: '#c9a66b' },
  },
  {
    key: 'gravel_banks',
    name: 'Gravel Banks',
    description: 'Loose, easy gravel with plenty of groundwater running through it.',
    isDefault: false,
    minDepth: 8 * S,
    maxDepth: 30 * S,
    weight: 1.3,
    noiseScale: 13 * S,
    blockPalette: { swaps: [{ from: 'DIRT', to: 'GRAVEL', chance: 1 }] },
    fluidWeights: { WATER: 2, LAVA: 0.2 },
    ambient: { tint: '#7d7d7d' },
  },
  {
    key: 'oil_shale',
    name: 'Oil Shale',
    description: 'Dark clay-bound shale soaked in oil, with hydrogen trapped alongside it.',
    isDefault: false,
    minDepth: 10 * S,
    maxDepth: 32 * S,
    weight: 1.3,
    noiseScale: 12 * S,
    blockPalette: { swaps: [{ from: 'DIRT', to: 'CLAY', chance: 1 }, { from: 'ROCK', to: 'STONE', chance: 0.4 }] },
    fluidWeights: { OIL: 4, WATER: 0.4 },
    gasWeights: { HYDROGEN: 2.5 },
    ambient: { tint: '#3d3329' },
  },
  {
    key: 'frozen_caves',
    name: 'Frozen Caves',
    description: 'Ice and cold stone. Plenty of ice, no oil or lava, and nitrogen collects in the cold.',
    isDefault: false,
    minDepth: 15 * S,
    maxDepth: 38 * S,
    weight: 1.4,
    noiseScale: 15 * S,
    blockPalette: {
      swaps: [
        { from: 'DIRT', to: 'ICE', chance: 1 },
        { from: 'ROCK', to: 'STONE', chance: 0.5 },
      ],
    },
    fluidWeights: { WATER: 1.5, OIL: 0, LAVA: 0 },
    gasWeights: { NITROGEN: 2 },
    ambient: { tint: '#7ec8e3' },
  },
  {
    key: 'deep_stone',
    name: 'Deep Stone',
    description: 'Hard grey stone far below, rich in ore, with gas pockets in every crack.',
    isDefault: false,
    minDepth: 20 * S,
    maxDepth: null,
    weight: 1.4,
    noiseScale: 16 * S,
    blockPalette: {
      weights: { COPPERIUM: 1.5, SILVERIUM: 2 },
      swaps: [
        { from: 'DIRT', to: 'STONE', chance: 1 },
        { from: 'ROCK', to: 'STONE', chance: 0.4 },
      ],
    },
    fluidWeights: { WATER: 0.4 },
    gasWeights: { HYDROGEN: 1.5, NITROGEN: 1.5 },
    ambient: { tint: '#4b5563' },
  },
  {
    key: 'magma_depths',
    name: 'Magma Depths',
    description: 'The bottom of the mine: cooled lava rock, rivers of lava, oil and hydrogen. No water.',
    isDefault: false,
    minDepth: 32 * S,
    maxDepth: null,
    weight: 1.6,
    noiseScale: 14 * S,
    blockPalette: {
      weights: { SILVERIUM: 2.5 },
      swaps: [
        { from: 'DIRT', to: 'STONE', chance: 1 },
        { from: 'ROCK', to: 'LAVAROCK', chance: 0.6 },
      ],
    },
    fluidWeights: { LAVA: 4, OIL: 1.5, WATER: 0 },
    gasWeights: { HYDROGEN: 2 },
    ambient: { tint: '#7c2d12' },
  },
];

/** What the script does with each biome: only the ones whose key is not in the table yet are created. */
export const planBiomes = (existingKeys: readonly string[]): Array<{ biome: NewBiome; action: 'create' | 'skip' }> =>
  FIRST_BIOMES.map((biome) => ({ biome, action: existingKeys.includes(biome.key) ? 'skip' : 'create' }));

/** The columns of a new row (Prisma wants JSON columns as JSON values, and null for none). */
export const biomeRow = (b: NewBiome) => ({
  key: b.key,
  name: b.name,
  description: b.description ?? null,
  isDefault: b.isDefault,
  minDepth: b.minDepth,
  maxDepth: b.maxDepth ?? null,
  weight: b.weight,
  noiseScale: b.noiseScale,
  blockPalette: (b.blockPalette ?? Prisma.JsonNull) as Prisma.InputJsonValue,
  fluidWeights: (b.fluidWeights ?? Prisma.JsonNull) as Prisma.InputJsonValue,
  gasWeights: (b.gasWeights ?? Prisma.JsonNull) as Prisma.InputJsonValue,
  mobSpawns: (b.mobSpawns ?? Prisma.JsonNull) as Prisma.InputJsonValue,
  ambient: (b.ambient ?? Prisma.JsonNull) as Prisma.InputJsonValue,
});

async function main() {
  const apply = process.argv.includes('--apply');
  const prisma = new PrismaClient();
  try {
    const existing = await prisma.biome.findMany({ select: { key: true, isDefault: true } });
    const hasDefault = existing.some((b) => b.isDefault);
    const plan = planBiomes(existing.map((b) => b.key)).map((p) => (p.biome.isDefault && hasDefault && p.action === 'create' ? { ...p, action: 'skip' as const } : p));
    for (const { biome, action } of plan) console.log(`Biome ${biome.key} (${biome.name}):`, action === 'create' ? 'will be created' : 'exists, skipped');
    if (!apply) {
      console.log('Dry run. Re-run with --apply to write.');
      return;
    }
    for (const { biome, action } of plan) if (action === 'create') await prisma.biome.create({ data: biomeRow(biome) });
    console.log('Done. Restart the server (or save any biome in the admin) to load them.');
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
