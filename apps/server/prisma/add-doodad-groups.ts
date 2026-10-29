/**
 * One-off, idempotent data script (ticket 146): gives the first doodads their group settings (mushrooms in clumps, grass in
 * meadows, bugs stay scattered), makes grass much denser in the biomes that have it, and raises the map's doodad cap to fit
 * the groups. Safe to run again: a doodad that already has a group share keeps its own settings, a grass link someone has
 * changed keeps its density, and a cap above the old default is left alone.
 *
 *   npx tsx prisma/add-doodad-groups.ts           # dry run: prints what it would do
 *   npx tsx prisma/add-doodad-groups.ts --apply   # does it
 */
import { Prisma, PrismaClient } from '@prisma/client';
import { DEFAULT_DOODAD_MAX_COUNT, type DoodadSpawnRules } from '@mine-me/shared';

/** Group settings by doodad key. A first guess to tune in the admin. Kinds not listed (bugs, drips, vents) stay scattered. */
export const FIRST_DOODAD_GROUPS: Readonly<Record<string, DoodadSpawnRules>> = {
  cave_mushroom: { groupChance: 0.8, groupSizeMin: 3, groupSizeMax: 8, groupSpread: 6 },
  glow_mushroom: { groupChance: 0.8, groupSizeMin: 3, groupSizeMax: 8, groupSpread: 6 },
  grass_tuft: { groupChance: 1, groupSizeMin: 6, groupSizeMax: 24, groupSpread: 12, groupFill: 0.8, maxCount: 600 },
  wall_moss: { groupChance: 0.7, groupSizeMin: 3, groupSizeMax: 10, groupSpread: 6 },
  stalagmite: { groupChance: 0.5, groupSizeMin: 2, groupSizeMax: 5, groupSpread: 6 },
  stalactite: { groupChance: 0.5, groupSizeMin: 2, groupSizeMax: 5, groupSpread: 6 },
  glow_crystal: { groupChance: 0.8, groupSizeMin: 2, groupSizeMax: 5, groupSpread: 6 },
  icicle: { groupChance: 0.6, groupSizeMin: 3, groupSizeMax: 8, groupSpread: 6 },
};

/**
 * Grass density by biome: [what the first seed gave it, the new value]. Grassy biomes get lots, the dry one the least. Only about 30
 * to 70 floor cells in the grass window (rows 1-45) are open in a whole mine, so the grassy biomes aim to cover most of them.
 */
export const GRASS_DENSITY: Readonly<Record<string, readonly [number, number]>> = {
  default: [7.2, 120],
  clay_pits: [9, 120],
  gravel_banks: [4.8, 50],
  sandstone_hollows: [3, 12],
};
export const GRASS_KEY = 'grass_tuft';

/** The cap the map config had before the groups. */
export const OLD_DOODAD_MAX_COUNT = 400;

export interface GroupPlanRow { key: string; action: 'set' | 'keep' | 'missing'; spawn?: DoodadSpawnRules }

/** Sets a doodad's group settings (merged into its other spawn rules) unless it already groups. */
export function planGroups(rows: ReadonlyArray<{ key: string; spawn: unknown }>, wanted: Readonly<Record<string, DoodadSpawnRules>> = FIRST_DOODAD_GROUPS): GroupPlanRow[] {
  return Object.entries(wanted).map(([key, groups]) => {
    const row = rows.find((r) => r.key === key);
    if (!row) return { key, action: 'missing' };
    const spawn = (row.spawn ?? {}) as DoodadSpawnRules;
    if (typeof spawn.groupChance === 'number' && spawn.groupChance > 0) return { key, action: 'keep', spawn };
    return { key, action: 'set', spawn: { ...spawn, ...groups } };
  });
}

export interface DensityPlanRow { biomeKey: string; action: 'set' | 'keep' | 'missing'; density: number; current?: number }

/** Raises the grass density of a biome link that still has the first seed's value. */
export function planGrassDensity(links: ReadonlyArray<{ biomeKey: string; density: number }>, wanted: Readonly<Record<string, readonly [number, number]>> = GRASS_DENSITY): DensityPlanRow[] {
  return Object.entries(wanted).map(([biomeKey, [old, density]]) => {
    const link = links.find((l) => l.biomeKey === biomeKey);
    if (!link) return { biomeKey, action: 'missing', density };
    return Math.abs(link.density - old) < 1e-9 ? { biomeKey, action: 'set', density, current: link.density } : { biomeKey, action: 'keep', density, current: link.density };
  });
}

/** The new cap for a map config row: the old default becomes the new one, anything the owner chose stays. */
export const planMaxCount = (current: number): number | null => (current === OLD_DOODAD_MAX_COUNT ? DEFAULT_DOODAD_MAX_COUNT : null);

async function main() {
  const apply = process.argv.includes('--apply');
  const prisma = new PrismaClient();
  try {
    const doodads = await prisma.doodad.findMany({ select: { key: true, spawn: true } });
    const groupPlan = planGroups(doodads);
    for (const p of groupPlan) console.log(`Doodad ${p.key}: ${p.action === 'set' ? 'group settings will be set' : p.action === 'keep' ? 'already groups, kept' : 'does not exist, skipped'}`);

    const grass = await prisma.doodad.findUnique({ where: { key: GRASS_KEY }, select: { id: true, biomes: { select: { id: true, density: true, biome: { select: { key: true } } } } } });
    const densityPlan = grass ? planGrassDensity(grass.biomes.map((l) => ({ biomeKey: l.biome.key, density: l.density }))) : [];
    for (const p of densityPlan) console.log(`Grass in ${p.biomeKey}: ${p.action === 'set' ? `density ${p.current} -> ${p.density}` : p.action === 'keep' ? `density ${p.current} was changed since the seed, kept` : 'no link, skipped'}`);

    const configs = await prisma.miningMapConfig.findMany({ select: { id: true, name: true, doodadMaxCount: true } });
    for (const c of configs) {
      const next = planMaxCount(c.doodadMaxCount);
      console.log(`Map config "${c.name}": ${next === null ? `cap ${c.doodadMaxCount} kept` : `cap ${c.doodadMaxCount} -> ${next}`}`);
    }

    if (!apply) {
      console.log('Dry run. Re-run with --apply to write.');
      return;
    }
    for (const p of groupPlan) if (p.action === 'set') await prisma.doodad.update({ where: { key: p.key }, data: { spawn: p.spawn as unknown as Prisma.InputJsonValue } });
    if (grass) for (const p of densityPlan) if (p.action === 'set') await prisma.doodadBiome.update({ where: { id: grass.biomes.find((l) => l.biome.key === p.biomeKey)!.id }, data: { density: p.density } });
    for (const c of configs) {
      const next = planMaxCount(c.doodadMaxCount);
      if (next !== null) await prisma.miningMapConfig.update({ where: { id: c.id }, data: { doodadMaxCount: next } });
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
