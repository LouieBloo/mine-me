import fs from 'fs';
import path from 'path';
import type { PrismaClient } from '@prisma/client';
import { resolveMobSounds, type GameItem, type Mob, type MiningBlockConfig, type SoundTrack } from '@mine-me/shared';
import { MiningDataManager, type GameDefinitions } from './subsystems/MiningDataManager';

type SoundLibraryEntry = Pick<SoundTrack, 'id' | 'url' | 'volume' | 'isActive'>;

/**
 * Gives each mob its playable `sounds`, resolved from its stored `soundEffects` references. A mob
 * with no references keeps any `sounds` it already carries (the dev seed JSON has plain urls).
 */
export function attachMobSounds<M extends Mob>(mobs: M[], library: SoundLibraryEntry[]): M[] {
  const byId = new Map(library.map((s) => [s.id, s]));
  return mobs.map((mob) =>
    mob.soundEffects ? { ...mob, sounds: resolveMobSounds(mob.soundEffects, byId) } : mob
  );
}

/**
 * Loads items, mobs and mining blocks from Postgres. Includes mirror what the admin tools export
 * to the seed JSON files, so consumers see the same shape either way.
 * Throws if the database cannot be read or has no items/blocks (i.e. it has not been seeded).
 */
export async function loadDefinitionsFromDatabase(
  prisma: Pick<PrismaClient, 'item' | 'mob' | 'miningBlock' | 'sound'>
): Promise<GameDefinitions> {
  const [items, mobs, blocks, sounds] = await Promise.all([
    prisma.item.findMany({
      include: { itemEffects: { include: { effect: true } }, particleEffect: true },
    }),
    prisma.mob.findMany({
      include: { dropTable: { include: { items: true } }, mobEffects: { include: { effect: true } } },
    }),
    prisma.miningBlock.findMany({
      include: { dropTable: { include: { items: true } }, idleParticleEffect: true },
    }),
    prisma.sound.findMany({ select: { id: true, url: true, volume: true, isActive: true } }),
  ]);

  if (items.length === 0 || blocks.length === 0) {
    throw new Error(
      `Game definitions are missing from the database (items: ${items.length}, blocks: ${blocks.length}). ` +
        'Has the database been seeded? (npx prisma db seed)'
    );
  }

  // Prisma rows carry plain strings and JSON columns where the shared definitions use unions and
  // typed configs; the admin app writes them in the shared shape, so this is the one boundary cast.
  const definitions = { items, mobs, blocks } as unknown as GameDefinitions;
  definitions.mobs = attachMobSounds(definitions.mobs, sounds);
  return definitions;
}

/**
 * Reads the developer seed JSON files. Used by tests and tooling only; the running server loads
 * from the database.
 */
export function loadDefinitionsFromFiles(dataDir: string): GameDefinitions {
  const read = <T>(file: string): T[] => {
    const parsed = JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf-8'));
    if (!Array.isArray(parsed)) throw new Error(`${file} must contain a JSON array`);
    return parsed as T[];
  };
  const soundsPath = path.join(dataDir, 'sounds.json');
  const library = fs.existsSync(soundsPath) ? read<SoundLibraryEntry>('sounds.json') : [];
  return {
    items: read<GameItem>('items.json'),
    mobs: attachMobSounds(read<Mob>('mobs.json'), library),
    blocks: read<MiningBlockConfig>('blocks.json'),
  };
}

/** Loads definitions from the database and installs them for the mining engine. */
export async function installDefinitionsFromDatabase(
  prisma: Pick<PrismaClient, 'item' | 'mob' | 'miningBlock' | 'sound'>
): Promise<void> {
  const definitions = await loadDefinitionsFromDatabase(prisma);
  MiningDataManager.initialize(definitions);
  console.log(
    `[Definitions] Loaded ${definitions.items.length} items, ${definitions.mobs.length} mobs, ${definitions.blocks.length} blocks from the database`
  );
}
