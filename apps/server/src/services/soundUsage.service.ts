import type { PrismaClient } from '@prisma/client';
import { normalizeMobSoundRefs, MOB_SOUND_SLOTS, normalizeCharacterSoundRefs, CHARACTER_SOUND_SLOTS, normalizeFluidSoundRefs, FLUID_SOUND_SLOTS, normalizeGasSoundRefs, GAS_SOUND_SLOTS, normalizeExtractorSoundRefs, EXTRACTOR_SOUND_SLOTS, normalizeDoodadSoundRefs, DOODAD_SOUND_SLOTS, normalizeMissionSoundRefs, MISSION_SOUND_SLOTS } from '@mine-me/shared';

import { CHARACTER_SOUND_CONFIG_ID } from './characterSounds.service';

type UsageDb = Pick<PrismaClient, 'mob' | 'item' | 'miningBlock'> & Partial<Pick<PrismaClient, 'characterSoundConfig' | 'fluid' | 'gas' | 'extractor' | 'doodad' | 'mission'>>;

/** What plays a sound: a short label such as `Mob: Mole Person (death)`. */
export type SoundUsage = string;

const addTo = (index: Map<string, SoundUsage[]>, key: string | null | undefined, label: SoundUsage) => {
  if (!key) return;
  const list = index.get(key) ?? [];
  if (!list.includes(label)) list.push(label);
  index.set(key, list);
};

/**
 * Where each library sound is used. Mobs point at sounds by id; items and blocks still store the
 * file url, so those are keyed by url. Returns two lookups so callers can ask by either.
 */
export async function buildSoundUsageIndex(db: UsageDb): Promise<{ byId: Map<string, SoundUsage[]>; byUrl: Map<string, SoundUsage[]> }> {
  const [mobs, items, blocks, characterConfig, fluids, gases, extractors, doodads, missions] = await Promise.all([
    db.mob.findMany({ select: { name: true, soundEffects: true } }),
    db.item.findMany({ select: { name: true, soundEffectUrl: true, soundEffects: true } }),
    db.miningBlock.findMany({ select: { name: true, soundEffectUrl: true } }),
    db.characterSoundConfig?.findUnique({ where: { id: CHARACTER_SOUND_CONFIG_ID } }) ?? null,
    db.fluid?.findMany({ select: { name: true, soundEffects: true } }) ?? [],
    db.gas?.findMany({ select: { name: true, soundEffects: true } }) ?? [],
    db.extractor?.findMany({ select: { name: true, soundEffects: true } }) ?? [],
    db.doodad?.findMany({ select: { name: true, soundEffects: true } }) ?? [],
    db.mission?.findMany({ select: { name: true, soundEffects: true } }) ?? [],
  ]);

  const byId = new Map<string, SoundUsage[]>();
  const byUrl = new Map<string, SoundUsage[]>();

  for (const mob of mobs) {
    const refs = normalizeMobSoundRefs(mob.soundEffects);
    for (const def of MOB_SOUND_SLOTS) addTo(byId, refs[def.slotKey]?.soundId, `Mob: ${mob.name} (${def.slotKey})`);
  }
  for (const fluid of fluids) {
    const refs = normalizeFluidSoundRefs(fluid.soundEffects);
    for (const def of FLUID_SOUND_SLOTS) addTo(byId, refs[def.slotKey]?.soundId, `Fluid: ${fluid.name} (${def.slotKey})`);
  }
  for (const gas of gases) {
    const refs = normalizeGasSoundRefs(gas.soundEffects);
    for (const def of GAS_SOUND_SLOTS) addTo(byId, refs[def.slotKey]?.soundId, `Gas: ${gas.name} (${def.slotKey})`);
  }
  for (const extractor of extractors) {
    const refs = normalizeExtractorSoundRefs(extractor.soundEffects);
    for (const def of EXTRACTOR_SOUND_SLOTS) addTo(byId, refs[def.slotKey]?.soundId, `Extractor: ${extractor.name} (${def.slotKey})`);
  }
  for (const mission of missions) {
    const refs = normalizeMissionSoundRefs(mission.soundEffects);
    for (const def of MISSION_SOUND_SLOTS) addTo(byId, refs[def.slotKey]?.soundId, `Mission: ${mission.name} (${def.slotKey})`);
  }
  for (const doodad of doodads) {
    const refs = normalizeDoodadSoundRefs(doodad.soundEffects);
    for (const def of DOODAD_SOUND_SLOTS) addTo(byId, refs[def.slotKey]?.soundId, `Doodad: ${doodad.name} (${def.slotKey})`);
  }
  const characterRefs = normalizeCharacterSoundRefs(characterConfig?.soundEffects);
  for (const def of CHARACTER_SOUND_SLOTS) addTo(byId, characterRefs[def.slotKey]?.soundId, `Character (${def.slotKey})`);
  for (const item of items) {
    addTo(byUrl, item.soundEffectUrl, `Item: ${item.name}`);
    const slots = item.soundEffects && typeof item.soundEffects === 'object' ? (item.soundEffects as Record<string, any>) : {};
    for (const [slot, cfg] of Object.entries(slots)) addTo(byUrl, cfg?.url, `Item: ${item.name} (${slot})`);
  }
  for (const block of blocks) addTo(byUrl, block.soundEffectUrl, `Block: ${block.name}`);
  return { byId, byUrl };
}

export const usageForSound = (
  index: Awaited<ReturnType<typeof buildSoundUsageIndex>>,
  sound: { id: string; url: string }
): SoundUsage[] => [...(index.byId.get(sound.id) ?? []), ...(index.byUrl.get(sound.url) ?? [])];
