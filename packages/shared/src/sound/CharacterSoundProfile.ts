import type {
  CharacterSoundEffectsConfig,
  CharacterSoundSlot,
  CharacterSoundSlotRefs,
  SoundTrack,
} from '../types/sound';
import { SoundSlotDefinition, normalizeSlotRefs, resolveSlotSounds } from './soundSlots';

/** One sound slot the player character has (hurt, jump...). Adding a slot here adds it to the admin; its trigger goes in the client. */
export class CharacterSoundSlotDefinition extends SoundSlotDefinition<CharacterSoundSlot> {}

export const CHARACTER_SOUND_SLOTS: readonly CharacterSoundSlotDefinition[] = [
  new CharacterSoundSlotDefinition({
    slotKey: 'hurt',
    label: 'Take Damage',
    description: 'Plays when the character is hurt (any source, including falls and rocks)',
    icon: '💥',
  }),
  new CharacterSoundSlotDefinition({
    slotKey: 'jump',
    label: 'Jump',
    description: 'Plays when the character jumps',
    icon: '🦘',
  }),
  new CharacterSoundSlotDefinition({
    slotKey: 'land',
    label: 'Land',
    description: 'Plays when the character lands after a fall (not on tiny hops)',
    icon: '🦶',
  }),
  new CharacterSoundSlotDefinition({
    slotKey: 'pickup',
    label: 'Pick Up Item',
    description: 'Plays when the character picks up an item from the ground (heard by players nearby)',
    icon: '🎒',
  }),
  new CharacterSoundSlotDefinition({
    slotKey: 'death',
    label: 'Death',
    description: 'Plays when the character dies',
    icon: '💀',
  }),
];

export const CHARACTER_SOUND_SLOT_KEYS: readonly CharacterSoundSlot[] = CHARACTER_SOUND_SLOTS.map((s) => s.slotKey);

export function getCharacterSoundSlot(slotKey: string): CharacterSoundSlotDefinition | undefined {
  return CHARACTER_SOUND_SLOTS.find((s) => s.slotKey === slotKey);
}

export function isCharacterSoundSlot(slotKey: unknown): slotKey is CharacterSoundSlot {
  return typeof slotKey === 'string' && CHARACTER_SOUND_SLOT_KEYS.includes(slotKey as CharacterSoundSlot);
}

/** Cleans stored/incoming references: unknown slots are dropped and each slot keeps only its sound id (and loop flag if allowed). */
export function normalizeCharacterSoundRefs(raw: unknown): CharacterSoundSlotRefs {
  return normalizeSlotRefs(raw, CHARACTER_SOUND_SLOTS);
}

/** Turns slot references into playable slots; a slot whose sound is gone or inactive stays silent. */
export function resolveCharacterSounds(
  refs: unknown,
  library: ReadonlyMap<string, Pick<SoundTrack, 'url' | 'isActive'>>
): CharacterSoundEffectsConfig {
  return resolveSlotSounds(refs, library, CHARACTER_SOUND_SLOTS);
}
