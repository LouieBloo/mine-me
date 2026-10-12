import type { MobSoundEffectsConfig, MobSoundSlot, MobSoundSlotRefs, SoundTrack } from '../types/sound';
import { SoundSlotDefinition, normalizeSlotRefs, resolveSlotSounds } from './soundSlots';

/** One sound slot every mob has (dig, idle, damage...). Adding a slot here adds it to the admin and the game. */
export class MobSoundSlotDefinition extends SoundSlotDefinition<MobSoundSlot> {}

export const MOB_SOUND_SLOTS: readonly MobSoundSlotDefinition[] = [
  new MobSoundSlotDefinition({
    slotKey: 'dig',
    label: 'Digging',
    description: 'Plays while the mob mines blocks',
    icon: '⛏️',
  }),
  new MobSoundSlotDefinition({
    slotKey: 'idle',
    label: 'Idle / Ambient',
    description: 'Plays now and then while the mob is nearby and not fighting',
    icon: '👃',
  }),
  new MobSoundSlotDefinition({
    slotKey: 'damage',
    label: 'Take Damage',
    description: 'Plays when the mob is hurt',
    icon: '💥',
  }),
  new MobSoundSlotDefinition({
    slotKey: 'attack',
    label: 'Attack',
    description: 'Plays when the mob swings or lands an attack',
    icon: '⚔️',
  }),
  new MobSoundSlotDefinition({
    slotKey: 'death',
    label: 'Death',
    description: 'Plays when the mob dies',
    icon: '💀',
  }),
];

export const MOB_SOUND_SLOT_KEYS: readonly MobSoundSlot[] = MOB_SOUND_SLOTS.map((s) => s.slotKey);

export function getMobSoundSlot(slotKey: string): MobSoundSlotDefinition | undefined {
  return MOB_SOUND_SLOTS.find((s) => s.slotKey === slotKey);
}

export function isMobSoundSlot(slotKey: unknown): slotKey is MobSoundSlot {
  return typeof slotKey === 'string' && MOB_SOUND_SLOT_KEYS.includes(slotKey as MobSoundSlot);
}

/**
 * Cleans stored/incoming slot references: unknown slots are dropped, and each slot keeps only a
 * sound id and a loop flag (only for slots that allow looping).
 */
export function normalizeMobSoundRefs(raw: unknown): MobSoundSlotRefs {
  return normalizeSlotRefs(raw, MOB_SOUND_SLOTS);
}

/**
 * Turns slot references into playable slots using the sound library. A slot whose sound is gone
 * or inactive is left out, so the game just stays silent for it.
 */
export function resolveMobSounds(
  refs: unknown,
  library: ReadonlyMap<string, Pick<SoundTrack, 'url' | 'isActive'>>
): MobSoundEffectsConfig {
  return resolveSlotSounds(refs, library, MOB_SOUND_SLOTS);
}
