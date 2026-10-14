import fs from 'fs';
import path from 'path';
import type { PrismaClient } from '@prisma/client';
import { resolveCharacterSounds, resolveFluidSounds, resolveMobSounds, type CharacterSoundEffectsConfig, type FluidDefinition, type ParticleEffect, type GameItem, type Mob, type MiningBlockConfig, type SoundTrack } from '@mine-me/shared';
import { CHARACTER_SOUND_CONFIG_ID } from '../characterSounds.service';
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
 * Gives each fluid its playable `sounds`, resolved from its stored `soundEffects` references. A fluid with no
 * references keeps any `sounds` it already carries.
 */
export function attachFluidSounds<F extends FluidDefinition>(fluids: F[], library: SoundLibraryEntry[]): F[] {
  const byId = new Map(library.map((s) => [s.id, s]));
  return fluids.map((fluid) => (fluid.soundEffects ? { ...fluid, sounds: resolveFluidSounds(fluid.soundEffects, byId) } : fluid));
}

type LoaderPrisma = Pick<PrismaClient, 'item' | 'mob' | 'miningBlock' | 'fluid' | 'particleEffect' | 'sound' | 'characterSoundConfig'>;

/** The player character's playable sounds, resolved from the stored slot references. */
export function buildCharacterSounds(refs: unknown, library: SoundLibraryEntry[]): CharacterSoundEffectsConfig {
  return resolveCharacterSounds(refs, new Map(library.map((s) => [s.id, s])));
}

/**
 * Loads items, mobs, mining blocks and fluids from Postgres. Includes mirror what the admin tools export
 * to the seed JSON files, so consumers see the same shape either way.
 * Throws if the database cannot be read or has no items/blocks (i.e. it has not been seeded).
 * Having no fluids is fine: fluids are optional content.
 */
export async function loadDefinitionsFromDatabase(
  prisma: LoaderPrisma
): Promise<GameDefinitions> {
  const [items, mobs, blocks, fluids, particleEffects, sounds, characterSoundConfig] = await Promise.all([
    prisma.item.findMany({
      include: { itemEffects: { include: { effect: true } }, particleEffect: true },
    }),
    prisma.mob.findMany({
      include: { dropTable: { include: { items: true } }, mobEffects: { include: { effect: true } } },
    }),
    prisma.miningBlock.findMany({
      include: { dropTable: { include: { items: true } }, idleParticleEffect: true },
    }),
    prisma.fluid.findMany({ orderBy: { createdAt: 'asc' } }),
    prisma.particleEffect.findMany(),
    prisma.sound.findMany({ select: { id: true, url: true, volume: true, isActive: true } }),
    prisma.characterSoundConfig.findUnique({ where: { id: CHARACTER_SOUND_CONFIG_ID } }),
  ]);

  if (items.length === 0 || blocks.length === 0) {
    throw new Error(
      `Game definitions are missing from the database (items: ${items.length}, blocks: ${blocks.length}). ` +
        'Has the database been seeded? (npx prisma db seed)'
    );
  }

  // Prisma rows carry plain strings and JSON columns where the shared definitions use unions and
  // typed configs; the admin app writes them in the shared shape, so this is the one boundary cast.
  const definitions = { items, mobs, blocks, fluids, particleEffects } as unknown as GameDefinitions;
  definitions.mobs = attachMobSounds(definitions.mobs, sounds);
  definitions.fluids = attachFluidSounds(definitions.fluids ?? [], sounds);
  definitions.characterSounds = buildCharacterSounds(characterSoundConfig?.soundEffects, sounds);
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
    characterSounds: {},
    items: read<GameItem>('items.json'),
    mobs: attachMobSounds(read<Mob>('mobs.json'), library),
    blocks: read<MiningBlockConfig>('blocks.json'),
    fluids: fs.existsSync(path.join(dataDir, 'fluids.json')) ? read<FluidDefinition>('fluids.json') : [],
    particleEffects: fs.existsSync(path.join(dataDir, 'particle_effects.json')) ? read<ParticleEffect>('particle_effects.json') : [],
  };
}

/** Loads definitions from the database and installs them for the mining engine. */
export async function installDefinitionsFromDatabase(
  prisma: LoaderPrisma
): Promise<void> {
  const definitions = await loadDefinitionsFromDatabase(prisma);
  MiningDataManager.initialize(definitions);
  console.log(
    `[Definitions] Loaded ${definitions.items.length} items, ${definitions.mobs.length} mobs, ${definitions.blocks.length} blocks, ${definitions.fluids?.length ?? 0} fluids from the database`
  );
}
