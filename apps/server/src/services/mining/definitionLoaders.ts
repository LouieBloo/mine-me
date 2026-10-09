import fs from 'fs';
import path from 'path';
import type { PrismaClient } from '@prisma/client';
import { MiningDataManager, type GameDefinitions } from './subsystems/MiningDataManager';

/**
 * Loads items, mobs and mining blocks from Postgres. Includes mirror what the admin tools export
 * to the seed JSON files, so consumers see the same shape either way.
 * Throws if the database cannot be read or has no items/blocks (i.e. it has not been seeded).
 */
export async function loadDefinitionsFromDatabase(
  prisma: Pick<PrismaClient, 'item' | 'mob' | 'miningBlock'>
): Promise<GameDefinitions> {
  const [items, mobs, blocks] = await Promise.all([
    prisma.item.findMany({
      include: { itemEffects: { include: { effect: true } }, particleEffect: true },
    }),
    prisma.mob.findMany({ include: { dropTable: { include: { items: true } } } }),
    prisma.miningBlock.findMany({
      include: { dropTable: { include: { items: true } }, idleParticleEffect: true },
    }),
  ]);

  if (items.length === 0 || blocks.length === 0) {
    throw new Error(
      `Game definitions are missing from the database (items: ${items.length}, blocks: ${blocks.length}). ` +
        'Has the database been seeded? (npx prisma db seed)'
    );
  }

  return { items, mobs, blocks };
}

/**
 * Reads the developer seed JSON files. Used by tests and tooling only; the running server loads
 * from the database.
 */
export function loadDefinitionsFromFiles(dataDir: string): GameDefinitions {
  const read = (file: string): any[] => {
    const parsed = JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf-8'));
    if (!Array.isArray(parsed)) throw new Error(`${file} must contain a JSON array`);
    return parsed;
  };
  return { items: read('items.json'), mobs: read('mobs.json'), blocks: read('blocks.json') };
}

/** Loads definitions from the database and installs them for the mining engine. */
export async function installDefinitionsFromDatabase(
  prisma: Pick<PrismaClient, 'item' | 'mob' | 'miningBlock'>
): Promise<void> {
  const definitions = await loadDefinitionsFromDatabase(prisma);
  MiningDataManager.initialize(definitions);
  console.log(
    `[Definitions] Loaded ${definitions.items.length} items, ${definitions.mobs.length} mobs, ${definitions.blocks.length} blocks from the database`
  );
}
