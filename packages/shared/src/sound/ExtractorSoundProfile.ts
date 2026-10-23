import type { ExtractorSoundEffectsConfig, ExtractorSoundSlot, ExtractorSoundSlotRefs, SoundTrack } from '../types/sound';
import { SoundSlotDefinition, normalizeSlotRefs, resolveSlotSounds } from './soundSlots';

/** One sound slot every extractor has (landing, running loop). Adding a slot here adds it to the admin; its trigger goes in the client. */
export class ExtractorSoundSlotDefinition extends SoundSlotDefinition<ExtractorSoundSlot> {}

export const EXTRACTOR_SOUND_SLOTS: readonly ExtractorSoundSlotDefinition[] = [
  new ExtractorSoundSlotDefinition({
    slotKey: 'landing',
    label: 'Landing',
    description: 'Plays once as the extractor comes down onto the surface at the start of a run',
    icon: '🛬',
  }),
  new ExtractorSoundSlotDefinition({
    slotKey: 'loop',
    label: 'Running',
    description: 'Plays (looping, heard by players nearby) while the extractor is working',
    icon: '⚙️',
    defaultLoop: true,
    loopToggleable: true,
  }),
  new ExtractorSoundSlotDefinition({
    slotKey: 'unload',
    label: 'Item onto belt',
    description: 'Plays each time an item is put on the conveyor belt (heard by players nearby)',
    icon: '📦',
  }),
  new ExtractorSoundSlotDefinition({
    slotKey: 'beltBreak',
    label: 'Belt breaks',
    description: 'Plays where a belt segment breaks (heard by players nearby)',
    icon: '💥',
  }),
];

export const EXTRACTOR_SOUND_SLOT_KEYS: readonly ExtractorSoundSlot[] = EXTRACTOR_SOUND_SLOTS.map((s) => s.slotKey);

export function getExtractorSoundSlot(slotKey: string): ExtractorSoundSlotDefinition | undefined {
  return EXTRACTOR_SOUND_SLOTS.find((s) => s.slotKey === slotKey);
}

export function isExtractorSoundSlot(slotKey: unknown): slotKey is ExtractorSoundSlot {
  return typeof slotKey === 'string' && EXTRACTOR_SOUND_SLOT_KEYS.includes(slotKey as ExtractorSoundSlot);
}

/** Cleans stored/incoming slot references: unknown slots are dropped, and each slot keeps only a sound id, volume and (where allowed) loop flag. */
export function normalizeExtractorSoundRefs(raw: unknown): ExtractorSoundSlotRefs {
  return normalizeSlotRefs(raw, EXTRACTOR_SOUND_SLOTS);
}

/** Turns slot references into playable slots using the sound library; a slot whose sound is gone or inactive stays silent. */
export function resolveExtractorSounds(
  refs: unknown,
  library: ReadonlyMap<string, Pick<SoundTrack, 'url' | 'isActive'>>
): ExtractorSoundEffectsConfig {
  return resolveSlotSounds(refs, library, EXTRACTOR_SOUND_SLOTS);
}
