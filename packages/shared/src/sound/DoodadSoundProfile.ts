import type { DoodadSoundEffectsConfig, DoodadSoundSlot, DoodadSoundSlotRefs, SoundTrack } from '../types/sound';
import { SoundSlotDefinition, normalizeSlotRefs, resolveSlotSounds } from './soundSlots';

/** One sound slot every doodad has (ambient, react...). Adding a slot here adds it to the admin; its trigger goes in the client. */
export class DoodadSoundSlotDefinition extends SoundSlotDefinition<DoodadSoundSlot> {}

export const DOODAD_SOUND_SLOTS: readonly DoodadSoundSlotDefinition[] = [
  new DoodadSoundSlotDefinition({
    slotKey: 'ambient',
    label: 'Ambient',
    description: 'Plays near the doodad while it is on screen (a drip, a hum, a chirp)',
    defaultLoop: true,
    loopToggleable: true,
    icon: '🍄',
  }),
  new DoodadSoundSlotDefinition({
    slotKey: 'react',
    label: 'React',
    description: 'Plays when a player or mob brushes past it',
    icon: '🌿',
  }),
  new DoodadSoundSlotDefinition({
    slotKey: 'break',
    label: 'Break',
    description: 'Plays when the doodad disappears because the block it hangs from or sits on is gone',
    icon: '💥',
  }),
];

export const DOODAD_SOUND_SLOT_KEYS: readonly DoodadSoundSlot[] = DOODAD_SOUND_SLOTS.map((s) => s.slotKey);

export function getDoodadSoundSlot(slotKey: string): DoodadSoundSlotDefinition | undefined {
  return DOODAD_SOUND_SLOTS.find((s) => s.slotKey === slotKey);
}

export function isDoodadSoundSlot(slotKey: unknown): slotKey is DoodadSoundSlot {
  return typeof slotKey === 'string' && DOODAD_SOUND_SLOT_KEYS.includes(slotKey as DoodadSoundSlot);
}

/** Cleans stored/incoming slot references: unknown slots are dropped, and each slot keeps only a sound id, volume and (where allowed) loop flag. */
export function normalizeDoodadSoundRefs(raw: unknown): DoodadSoundSlotRefs {
  return normalizeSlotRefs(raw, DOODAD_SOUND_SLOTS);
}

/** Turns slot references into playable slots using the sound library; a slot whose sound is gone or inactive stays silent. */
export function resolveDoodadSounds(
  refs: unknown,
  library: ReadonlyMap<string, Pick<SoundTrack, 'url' | 'isActive'>>
): DoodadSoundEffectsConfig {
  return resolveSlotSounds(refs, library, DOODAD_SOUND_SLOTS);
}
