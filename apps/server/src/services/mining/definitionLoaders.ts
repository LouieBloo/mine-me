import fs from 'fs';
import path from 'path';
import type { PrismaClient } from '@prisma/client';
import { resolveCharacterSounds, resolveExtractorSounds, resolveFluidSounds, resolveDoodadSounds, resolveGasSounds, resolveMissionSounds, resolveMobSounds, resolveSurfaceSounds, type BiomeDefinition, type SurfaceEnvironmentDefinition, type DoodadDefinition, type CharacterSoundEffectsConfig, type ExtractorDefinition, type FluidDefinition, type GasDefinition, type MissionDefinition, type ParticleEffect, type GameItem, type Mob, type MiningBlockConfig, type SoundTrack } from '@mine-me/shared';
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

/**
 * Gives each gas its playable `sounds`, resolved from its stored `soundEffects` references. A gas with no
 * references keeps any `sounds` it already carries.
 */
export function attachGasSounds<G extends GasDefinition>(gases: G[], library: SoundLibraryEntry[]): G[] {
  const byId = new Map(library.map((s) => [s.id, s]));
  return gases.map((gas) => (gas.soundEffects ? { ...gas, sounds: resolveGasSounds(gas.soundEffects, byId) } : gas));
}

/**
 * Gives each extractor its playable `sounds`, resolved from its stored `soundEffects` references. An extractor with no
 * references keeps any `sounds` it already carries.
 */
export function attachExtractorSounds<E extends ExtractorDefinition>(extractors: E[], library: SoundLibraryEntry[]): E[] {
  const byId = new Map(library.map((s) => [s.id, s]));
  return extractors.map((extractor) => (extractor.soundEffects ? { ...extractor, sounds: resolveExtractorSounds(extractor.soundEffects, byId) } : extractor));
}

/**
 * Gives each doodad its playable `sounds`, resolved from its stored `soundEffects` references. A doodad with no
 * references keeps any `sounds` it already carries.
 */
export function attachDoodadSounds<D extends DoodadDefinition>(doodads: D[], library: SoundLibraryEntry[]): D[] {
  const byId = new Map(library.map((s) => [s.id, s]));
  return doodads.map((doodad) => (doodad.soundEffects ? { ...doodad, sounds: resolveDoodadSounds(doodad.soundEffects, byId) } : doodad));
}

/**
 * Gives each mission its playable `sounds`, resolved from its stored `soundEffects` references. A mission with no
 * references keeps any `sounds` it already carries.
 */
export function attachMissionSounds<M extends MissionDefinition>(missions: M[], library: SoundLibraryEntry[]): M[] {
  const byId = new Map(library.map((s) => [s.id, s]));
  return missions.map((mission) => (mission.soundEffects ? { ...mission, sounds: resolveMissionSounds(mission.soundEffects, byId) } : mission));
}

/**
 * Gives each surface environment its playable `sounds`, resolved from its stored `soundEffects` references. An environment
 * with no references keeps any `sounds` it already carries.
 */
export function attachSurfaceSounds<E extends SurfaceEnvironmentDefinition>(environments: E[], library: SoundLibraryEntry[]): E[] {
  const byId = new Map(library.map((s) => [s.id, s]));
  return environments.map((env) => (env.soundEffects ? { ...env, sounds: resolveSurfaceSounds(env.soundEffects, byId) } : env));
}

/** A surface environment row as Prisma returns it: the JSON columns hold the shared shapes (the admin writes them that way). */
export function toSurfaceEnvironment(row: unknown): SurfaceEnvironmentDefinition {
  const r = row as SurfaceEnvironmentDefinition;
  return { ...r, layers: Array.isArray(r.layers) ? r.layers : [], props: Array.isArray(r.props) ? r.props : [] };
}

/** A mission row as Prisma returns it: the JSON columns hold the shared shapes (the admin writes them that way). */
export function toMissionDefinition(row: unknown): MissionDefinition {
  const r = row as MissionDefinition;
  return { ...r, objectives: Array.isArray(r.objectives) ? r.objectives : [], rewardItems: Array.isArray(r.rewardItems) ? r.rewardItems : [] };
}

/** A doodad row as Prisma returns it with its biome links (and each link's biome key). */
export type DoodadRow = Omit<DoodadDefinition, 'biomes'> & { biomes?: Array<{ biomeId: string; weight: number; density: number; biome?: { key: string } | null }> };

/** The shared shape of a doodad: its biome links flattened to `{ biomeId, biomeKey, weight, density }`. Also what the dev mirror stores. */
export function toDoodadDefinition(row: DoodadRow): DoodadDefinition {
  return {
    ...row,
    biomes: (row.biomes ?? []).map((link) => ({ biomeId: link.biomeId, ...(link.biome?.key ? { biomeKey: link.biome.key } : {}), weight: link.weight, density: link.density })),
  };
}

type LoaderPrisma = Pick<PrismaClient, 'item' | 'mob' | 'miningBlock' | 'fluid' | 'gas' | 'particleEffect' | 'sound' | 'characterSoundConfig'> &
  Partial<Pick<PrismaClient, 'extractor' | 'biome' | 'doodad' | 'mission' | 'surfaceEnvironment'>>;

/** The player character's playable sounds, resolved from the stored slot references. */
export function buildCharacterSounds(refs: unknown, library: SoundLibraryEntry[]): CharacterSoundEffectsConfig {
  return resolveCharacterSounds(refs, new Map(library.map((s) => [s.id, s])));
}

/**
 * Loads items, mobs, mining blocks, fluids, gases and biomes from Postgres. Includes mirror what the admin tools export
 * to the seed JSON files, so consumers see the same shape either way.
 * Throws if the database cannot be read or has no items/blocks (i.e. it has not been seeded).
 * Having no fluids, gases or biomes is fine: they are optional content (the generator adds a built-in default biome).
 */
export async function loadDefinitionsFromDatabase(
  prisma: LoaderPrisma
): Promise<GameDefinitions> {
  const [items, mobs, blocks, fluids, gases, particleEffects, sounds, characterSoundConfig, extractors, biomes, doodadRows, missionRows, surfaceRows] = await Promise.all([
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
    prisma.gas.findMany({ orderBy: { createdAt: 'asc' } }),
    prisma.particleEffect.findMany(),
    prisma.sound.findMany({ select: { id: true, url: true, volume: true, isActive: true } }),
    prisma.characterSoundConfig.findUnique({ where: { id: CHARACTER_SOUND_CONFIG_ID } }),
    prisma.extractor?.findMany({ orderBy: { createdAt: 'asc' } }) ?? [],
    prisma.biome?.findMany({ orderBy: { createdAt: 'asc' } }) ?? [],
    prisma.doodad?.findMany({ orderBy: { createdAt: 'asc' }, include: { biomes: { include: { biome: { select: { key: true } } } } } }) ?? [],
    prisma.mission?.findMany({ orderBy: { createdAt: 'asc' } }) ?? [],
    prisma.surfaceEnvironment?.findMany({ orderBy: { createdAt: 'asc' } }) ?? [],
  ]);

  if (items.length === 0 || blocks.length === 0) {
    throw new Error(
      `Game definitions are missing from the database (items: ${items.length}, blocks: ${blocks.length}). ` +
        'Has the database been seeded? (npx prisma db seed)'
    );
  }

  // Prisma rows carry plain strings and JSON columns where the shared definitions use unions and
  // typed configs; the admin app writes them in the shared shape, so this is the one boundary cast.
  const definitions = { items, mobs, blocks, fluids, gases, particleEffects, extractors, biomes } as unknown as GameDefinitions;
  definitions.mobs = attachMobSounds(definitions.mobs, sounds);
  definitions.fluids = attachFluidSounds(definitions.fluids ?? [], sounds);
  definitions.gases = attachGasSounds(definitions.gases ?? [], sounds);
  definitions.extractors = attachExtractorSounds(definitions.extractors ?? [], sounds);
  definitions.doodads = attachDoodadSounds((doodadRows as unknown as DoodadRow[]).map(toDoodadDefinition), sounds);
  definitions.missions = attachMissionSounds((missionRows as unknown[]).map(toMissionDefinition), sounds);
  definitions.surfaceEnvironments = attachSurfaceSounds((surfaceRows as unknown[]).map(toSurfaceEnvironment), sounds);
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
    gases: fs.existsSync(path.join(dataDir, 'gases.json')) ? read<GasDefinition>('gases.json') : [],
    biomes: fs.existsSync(path.join(dataDir, 'biomes.json')) ? read<BiomeDefinition>('biomes.json') : [],
    doodads: attachDoodadSounds(fs.existsSync(path.join(dataDir, 'doodads.json')) ? read<DoodadDefinition>('doodads.json') : [], library),
    missions: attachMissionSounds(fs.existsSync(path.join(dataDir, 'missions.json')) ? read<MissionDefinition>('missions.json') : [], library),
    surfaceEnvironments: attachSurfaceSounds(fs.existsSync(path.join(dataDir, 'surface_environments.json')) ? read<SurfaceEnvironmentDefinition>('surface_environments.json') : [], library),
    extractors: fs.existsSync(path.join(dataDir, 'extractors.json')) ? read<ExtractorDefinition>('extractors.json') : [],
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
    `[Definitions] Loaded ${definitions.items.length} items, ${definitions.mobs.length} mobs, ${definitions.blocks.length} blocks, ${definitions.fluids?.length ?? 0} fluids, ${definitions.gases?.length ?? 0} gases, ${definitions.extractors?.length ?? 0} extractors, ${definitions.biomes?.length ?? 0} biomes, ${definitions.doodads?.length ?? 0} doodads, ${definitions.missions?.length ?? 0} missions, ${definitions.surfaceEnvironments?.length ?? 0} surface environments from the database`
  );
}
