/**
 * One-off, idempotent data script (tickets 099-107): the first pass of doodads. Creates, only the ones that are missing, a
 * dozen pieces of cave scenery - mushrooms, grass, stalactites, crystals, a lava vent, wall moss, fireflies and a beetle -
 * and links each to the biomes it suits. They have NO pictures yet: the game draws a placeholder shape for each until art is
 * uploaded from the admin Doodads page (the art brief is `gemini_tasks/doodads-art.md`). They use only the existing blocks,
 * fluids, gases and particle effects, by key or name. Existing doodads (same key) are never touched.
 *
 * Sizes are in small blocks (original value x BLOCK_SCALE). Weights and densities are a first guess to tune in the admin: a
 * spot that fits is given a doodad with a 3% chance times weight times density. Caves are sparse, so the densities are high (a generated mine ends up with roughly 70-90 doodads).
 *
 *   npx tsx prisma/add-first-doodads.ts           # dry run: prints what it would do
 *   npx tsx prisma/add-first-doodads.ts --apply   # does it
 */
import { PrismaClient, Prisma } from '@prisma/client';
import { BLOCK_SCALE, type DoodadAnchor, type DoodadDefinition } from '@mine-me/shared';

const S = BLOCK_SCALE;

/** The biomes of the first biome pass (see add-first-biomes.ts). */
type BiomeKey = 'default' | 'clay_pits' | 'sandstone_hollows' | 'gravel_banks' | 'oil_shale' | 'frozen_caves' | 'deep_stone' | 'magma_depths';

export interface FirstDoodad extends Omit<DoodadDefinition, 'id' | 'biomes' | 'createdAt' | 'updatedAt' | 'particleEffectId' | 'sounds' | 'soundEffects' | 'anchor'> {
  anchor: DoodadAnchor;
  /** The name of the library particle effect to play (resolved to its id when the row is made); absent = none. */
  particleEffectName?: string;
  /** Biome key -> [weight, density]. */
  links: Partial<Record<BiomeKey, [number, number]>>;
}

/** Block keys a rocky ceiling or floor may be made of (not ice: that has its own icicle). */
const ROCKY = ['DIRT', 'ROCK', 'STONE', 'SANDSTONE', 'GRAVEL', 'CLAY', 'LAVAROCK'];

export const FIRST_DOODADS: readonly FirstDoodad[] = [
  {
    key: 'cave_mushroom',
    name: 'Cave Mushroom',
    description: 'A pale mushroom that leans away when something brushes past.',
    anchor: 'FLOOR',
    width: 1,
    height: 1,
    sizeVariants: [{ width: 1, height: 1, weight: 4 }, { width: 2, height: 2, weight: 1 }],
    zOffset: 0,
    motion: { preset: 'sway' },
    reacts: { strength: 0.6, radius: 3 },
    spawn: { minDepth: 6, minSpacing: 3 },
    links: { default: [0.6, 6], clay_pits: [1.2, 9], gravel_banks: [0.5, 6], deep_stone: [0.8, 6] },
  },
  {
    key: 'glow_mushroom',
    name: 'Glow Mushroom',
    description: 'A mushroom that glows a soft green in the dark. Only in the dark.',
    anchor: 'FLOOR',
    width: 1,
    height: 1,
    sizeVariants: [{ width: 1, height: 1, weight: 4 }, { width: 2, height: 2, weight: 1 }],
    zOffset: 0,
    motion: { preset: 'pulse', speed: 0.3 },
    reacts: { strength: 0.4, radius: 3 },
    light: { enabled: true, type: 'POINT', effect: 'PULSE', color: '#7dff9b', radius: 7, intensity: 0.7, pulseSpeed: 1.6, minIntensity: 0.45, maxIntensity: 0.8 },
    spawn: { darkOnly: true, minSpacing: 6 },
    links: { deep_stone: [1.4, 7.2], oil_shale: [0.4, 4.8], default: [0.3, 3.6], sandstone_hollows: [0.3, 3.6] },
  },
  {
    key: 'grass_tuft',
    name: 'Grass Tuft',
    description: 'A tuft of pale cave grass near the surface.',
    anchor: 'FLOOR',
    width: 1,
    height: 1,
    sizeVariants: [{ width: 1, height: 1, weight: 5 }, { width: 2, height: 2, weight: 1 }],
    zOffset: -1,
    motion: { preset: 'sway' },
    reacts: { strength: 0.8, radius: 3 },
    spawn: { minDepth: 1, maxDepth: 15 * S },
    links: { default: [1, 7.2], clay_pits: [1, 9], gravel_banks: [0.4, 4.8], sandstone_hollows: [0.15, 3] },
  },
  {
    key: 'stalactite',
    name: 'Stalactite',
    description: 'Rock hanging from a cave ceiling.',
    anchor: 'CEILING',
    width: 1,
    height: 2,
    sizeVariants: [{ width: 1, height: 2, weight: 4 }, { width: 2, height: 3, weight: 1 }],
    zOffset: 0,
    spawn: { blocks: ROCKY, minDepth: 6, minSpacing: 3 },
    links: { default: [1, 6], sandstone_hollows: [1, 9], gravel_banks: [1, 6], oil_shale: [0.8, 6], deep_stone: [1, 9], clay_pits: [0.5, 4.8], magma_depths: [0.6, 4.8] },
  },
  {
    key: 'stalagmite',
    name: 'Stalagmite',
    description: 'Rock rising from a cave floor.',
    anchor: 'FLOOR',
    width: 1,
    height: 2,
    sizeVariants: [{ width: 1, height: 2, weight: 4 }, { width: 2, height: 3, weight: 1 }],
    zOffset: 0,
    spawn: { blocks: ROCKY, minDepth: 6, minSpacing: 3 },
    links: { default: [0.8, 6], sandstone_hollows: [1, 7.2], gravel_banks: [0.8, 4.8], oil_shale: [0.6, 4.8], deep_stone: [1, 7.2], magma_depths: [0.6, 4.8] },
  },
  {
    key: 'dripping_stalactite',
    name: 'Dripping Stalactite',
    description: 'A wet stalactite that drips into the water below. It only grows near water.',
    anchor: 'CEILING',
    width: 1,
    height: 2,
    zOffset: 0,
    motion: { preset: 'drip', speed: 0.25 },
    spawn: { blocks: ROCKY, minDepth: 6, nearFluids: ['WATER'], nearRadius: 4 * S, minSpacing: 6 },
    links: { clay_pits: [1.5, 9], gravel_banks: [1.2, 9], default: [0.4, 4.8], sandstone_hollows: [0.1, 2.4] },
  },
  {
    key: 'glow_crystal',
    name: 'Glow Crystal',
    description: 'A cluster of cold blue crystals that pulse with light.',
    anchor: 'FLOOR',
    width: 1,
    height: 2,
    sizeVariants: [{ width: 1, height: 2, weight: 3 }, { width: 2, height: 3, weight: 1 }],
    zOffset: 0,
    motion: { preset: 'pulse', speed: 0.4 },
    light: { enabled: true, type: 'POINT', effect: 'PULSE', color: '#7ee8ff', radius: 8, intensity: 0.8, pulseSpeed: 1.2, minIntensity: 0.5, maxIntensity: 0.9 },
    spawn: { minDepth: 12, minSpacing: 8 },
    links: { frozen_caves: [1.5, 9], deep_stone: [1, 6] },
  },
  {
    key: 'icicle',
    name: 'Icicle',
    description: 'A long icicle hanging from frozen ground.',
    anchor: 'CEILING',
    width: 1,
    height: 2,
    sizeVariants: [{ width: 1, height: 2, weight: 3 }, { width: 1, height: 3, weight: 1 }],
    zOffset: 0,
    spawn: { blocks: ['ICE', 'STONE', 'DIRT'], minDepth: 6, minSpacing: 2 },
    links: { frozen_caves: [1.5, 12] },
  },
  {
    key: 'lava_vent',
    name: 'Lava Vent',
    description: 'A crack in the floor glowing orange, with embers rising. Only beside lava.',
    anchor: 'FLOOR',
    width: 2,
    height: 1,
    zOffset: 0,
    motion: { preset: 'flicker', speed: 1.4 },
    light: { enabled: true, type: 'POINT', effect: 'FLICKER', color: '#ff6a1a', radius: 9, intensity: 0.9, flickerSpeed: 9, flickerAmount: 0.3 },
    particleEffectName: 'Ember Flame',
    spawn: { nearFluids: ['LAVA'], nearRadius: 3 * S, minSpacing: 6 },
    links: { magma_depths: [1.5, 9] },
  },
  {
    key: 'wall_moss',
    name: 'Wall Moss',
    description: 'Damp moss clinging to a cave wall.',
    anchor: 'WALL',
    width: 1,
    height: 2,
    sizeVariants: [{ width: 1, height: 2, weight: 2 }, { width: 1, height: 1, weight: 1 }],
    zOffset: -1,
    spawn: { minDepth: 4, minSpacing: 2 },
    links: { clay_pits: [1.2, 9], gravel_banks: [0.8, 6], default: [0.5, 4.8], oil_shale: [0.5, 4.8], frozen_caves: [0.3, 3], deep_stone: [0.3, 3] },
  },
  {
    key: 'firefly',
    name: 'Firefly',
    description: 'A little light drifting through the dark. Scatters when you run at it.',
    anchor: 'AIR',
    width: 1,
    height: 1,
    zOffset: 1,
    motion: { preset: 'bob' },
    reacts: { strength: 1, radius: 5 },
    light: { enabled: true, type: 'POINT', effect: 'PULSE', color: '#d8ff6a', radius: 4, intensity: 0.6, pulseSpeed: 2.4, minIntensity: 0.2, maxIntensity: 0.7 },
    wander: { mode: 'FLUTTER', radius: 3 * S, speed: 1.2, pauseMs: 400 },
    spawn: { darkOnly: true, minSpacing: 4 * S },
    links: { clay_pits: [0.8, 4.8], default: [0.4, 3], deep_stone: [0.4, 3], gravel_banks: [0.4, 3] },
  },
  {
    key: 'cave_beetle',
    name: 'Cave Beetle',
    description: 'A beetle that crawls over the floor and scurries off when you come close.',
    anchor: 'FLOOR',
    width: 1,
    height: 1,
    zOffset: 1,
    reacts: { strength: 1, radius: 2 * S },
    wander: { mode: 'CRAWL', radius: 4 * S, speed: 1.5, pauseMs: 800 },
    spawn: { minDepth: 6, minSpacing: 5 * S },
    links: { default: [0.6, 4.8], clay_pits: [1, 6], gravel_banks: [1.2, 6], sandstone_hollows: [0.8, 4.8], deep_stone: [0.4, 3.6] },
  },
];

type Existing = { key: string };

/** What the script does with each doodad: only the ones whose key is not in the table yet are created. */
export const planDoodads = (existingKeys: readonly string[]): Array<{ doodad: FirstDoodad; action: 'create' | 'skip' }> =>
  FIRST_DOODADS.map((doodad) => ({ doodad, action: existingKeys.includes(doodad.key) ? 'skip' : 'create' }));

/** The definition a first doodad stands for (for the shared validation), with the biome links as the loader makes them. */
export const asDefinition = (d: FirstDoodad): DoodadDefinition => ({
  id: `first_${d.key}`,
  key: d.key,
  name: d.name,
  description: d.description,
  anchor: d.anchor,
  width: d.width,
  height: d.height,
  sizeVariants: d.sizeVariants,
  textureUrl: null,
  parts: d.parts,
  zOffset: d.zOffset,
  motion: d.motion,
  reacts: d.reacts,
  light: d.light,
  wander: d.wander,
  spawn: d.spawn,
  biomes: Object.entries(d.links).map(([biomeKey, [weight, density]]) => ({ biomeId: `b_${biomeKey}`, biomeKey, weight, density })),
});

const json = (value: unknown): Prisma.InputJsonValue => (value ?? Prisma.JsonNull) as Prisma.InputJsonValue;

/** The columns of a new row; `particleEffectId` and the biome ids are looked up by the caller. */
export const doodadRow = (d: FirstDoodad, particleEffectId: string | null) => ({
  key: d.key,
  name: d.name,
  description: d.description ?? null,
  anchor: d.anchor,
  width: d.width,
  height: d.height,
  sizeVariants: json(d.sizeVariants),
  textureUrl: null,
  parts: json(d.parts),
  zOffset: d.zOffset,
  motion: json(d.motion),
  reacts: json(d.reacts),
  light: json(d.light),
  particleEffectId,
  wander: json(d.wander),
  spawn: json(d.spawn),
});

async function main() {
  const apply = process.argv.includes('--apply');
  const prisma = new PrismaClient();
  try {
    const existing: Existing[] = await prisma.doodad.findMany({ select: { key: true } });
    const biomes = await prisma.biome.findMany({ select: { id: true, key: true } });
    const effects = await prisma.particleEffect.findMany({ select: { id: true, name: true } });
    const plan = planDoodads(existing.map((e) => e.key));
    for (const { doodad, action } of plan) {
      const missingBiomes = Object.keys(doodad.links).filter((k) => !biomes.some((b) => b.key === k));
      const missingEffect = doodad.particleEffectName && !effects.some((e) => e.name === doodad.particleEffectName);
      const notes = [
        missingBiomes.length > 0 ? `no biome ${missingBiomes.join(', ')} (those links are left out)` : '',
        missingEffect ? `no particle effect "${doodad.particleEffectName}" (none used)` : '',
      ].filter(Boolean);
      console.log(`Doodad ${doodad.key} (${doodad.name}):`, action === 'create' ? 'will be created' : 'exists, skipped', notes.length > 0 ? `- ${notes.join('; ')}` : '');
    }
    if (!apply) {
      console.log('Dry run. Re-run with --apply to write.');
      return;
    }
    for (const { doodad, action } of plan) {
      if (action !== 'create') continue;
      const effectId = effects.find((e) => e.name === doodad.particleEffectName)?.id ?? null;
      const links = Object.entries(doodad.links).flatMap(([key, [weight, density]]) => {
        const biome = biomes.find((b) => b.key === key);
        return biome ? [{ biomeId: biome.id, weight, density }] : [];
      });
      await prisma.doodad.create({ data: { ...doodadRow(doodad, effectId), ...(links.length > 0 ? { biomes: { create: links } } : {}) } });
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
