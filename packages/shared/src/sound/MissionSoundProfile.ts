import type { MissionSoundEffectsConfig, MissionSoundSlot, MissionSoundSlotRefs, SoundTrack } from '../types/sound';
import { SoundSlotDefinition, normalizeSlotRefs, resolveSlotSounds } from './soundSlots';

/** One sound slot every mission has. Adding a slot here adds it to the admin; its trigger goes in the client. */
export class MissionSoundSlotDefinition extends SoundSlotDefinition<MissionSoundSlot> {}

export const MISSION_SOUND_SLOTS: readonly MissionSoundSlotDefinition[] = [
  new MissionSoundSlotDefinition({
    slotKey: 'objective',
    label: 'Objective done',
    description: 'Plays when one objective of the mission is completed',
    icon: '✔️',
  }),
  new MissionSoundSlotDefinition({
    slotKey: 'complete',
    label: 'Mission complete',
    description: 'Plays when every objective is done and the reward is banked for a safe exit',
    icon: '🏆',
  }),
  new MissionSoundSlotDefinition({
    slotKey: 'failed',
    label: 'Mission failed',
    description: 'Plays when the run ends without the mission being completed and paid',
    icon: '💔',
  }),
];

export const MISSION_SOUND_SLOT_KEYS: readonly MissionSoundSlot[] = MISSION_SOUND_SLOTS.map((s) => s.slotKey);

export function getMissionSoundSlot(slotKey: string): MissionSoundSlotDefinition | undefined {
  return MISSION_SOUND_SLOTS.find((s) => s.slotKey === slotKey);
}

export function isMissionSoundSlot(slotKey: unknown): slotKey is MissionSoundSlot {
  return typeof slotKey === 'string' && MISSION_SOUND_SLOT_KEYS.includes(slotKey as MissionSoundSlot);
}

/** Cleans stored/incoming slot references: unknown slots are dropped, and each slot keeps only a sound id, volume and (where allowed) loop flag. */
export function normalizeMissionSoundRefs(raw: unknown): MissionSoundSlotRefs {
  return normalizeSlotRefs(raw, MISSION_SOUND_SLOTS);
}

/** Turns slot references into playable slots using the sound library; a slot whose sound is gone or inactive stays silent. */
export function resolveMissionSounds(
  refs: unknown,
  library: ReadonlyMap<string, Pick<SoundTrack, 'url' | 'isActive'>>
): MissionSoundEffectsConfig {
  return resolveSlotSounds(refs, library, MISSION_SOUND_SLOTS);
}
