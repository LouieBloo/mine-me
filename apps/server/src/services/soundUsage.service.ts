import type { PrismaClient } from '@prisma/client';
import { normalizeMobSoundRefs, MOB_SOUND_SLOTS } from '@mine-me/shared';

type UsageDb = Pick<PrismaClient, 'mob' | 'item' | 'miningBlock'>;

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
  const [mobs, items, blocks] = await Promise.all([
    db.mob.findMany({ select: { name: true, soundEffects: true } }),
    db.item.findMany({ select: { name: true, soundEffectUrl: true, soundEffects: true } }),
    db.miningBlock.findMany({ select: { name: true, soundEffectUrl: true } }),
  ]);

  const byId = new Map<string, SoundUsage[]>();
  const byUrl = new Map<string, SoundUsage[]>();

  for (const mob of mobs) {
    const refs = normalizeMobSoundRefs(mob.soundEffects);
    for (const def of MOB_SOUND_SLOTS) addTo(byId, refs[def.slotKey]?.soundId, `Mob: ${mob.name} (${def.slotKey})`);
  }
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
