import type { GasSoundEffectsConfig, GasSoundSlot, GasSoundSlotRefs, SoundTrack } from '../types/sound';
import { SoundSlotDefinition, normalizeSlotRefs, resolveSlotSounds } from './soundSlots';

/** One sound slot every gas has (enter, explode...). Adding a slot here adds it to the admin; its trigger goes in the client. */
export class GasSoundSlotDefinition extends SoundSlotDefinition<GasSoundSlot> {}

export const GAS_SOUND_SLOTS: readonly GasSoundSlotDefinition[] = [
  new GasSoundSlotDefinition({
    slotKey: 'enter',
    label: 'Enter',
    description: 'Plays when a player or mob walks into a cloud of this gas',
    icon: '☁️',
  }),
  new GasSoundSlotDefinition({
    slotKey: 'exit',
    label: 'Exit',
    description: 'Plays when a player or mob leaves a cloud of this gas',
    icon: '🌬️',
  }),
  new GasSoundSlotDefinition({
    slotKey: 'ignite',
    label: 'Ignite',
    description: 'Plays when this gas is set alight',
    icon: '🔥',
  }),
  new GasSoundSlotDefinition({
    slotKey: 'explode',
    label: 'Explode',
    description: 'Plays as an explosion of this gas passes through a cell',
    icon: '💥',
  }),
  new GasSoundSlotDefinition({
    slotKey: 'vent',
    label: 'Vent',
    description: 'Plays when this gas escapes into the open air',
    icon: '💨',
  }),
];

export const GAS_SOUND_SLOT_KEYS: readonly GasSoundSlot[] = GAS_SOUND_SLOTS.map((s) => s.slotKey);

export function getGasSoundSlot(slotKey: string): GasSoundSlotDefinition | undefined {
  return GAS_SOUND_SLOTS.find((s) => s.slotKey === slotKey);
}

export function isGasSoundSlot(slotKey: unknown): slotKey is GasSoundSlot {
  return typeof slotKey === 'string' && GAS_SOUND_SLOT_KEYS.includes(slotKey as GasSoundSlot);
}

/** Cleans stored/incoming slot references: unknown slots are dropped, and each slot keeps only a sound id, volume and (where allowed) loop flag. */
export function normalizeGasSoundRefs(raw: unknown): GasSoundSlotRefs {
  return normalizeSlotRefs(raw, GAS_SOUND_SLOTS);
}

/** Turns slot references into playable slots using the sound library; a slot whose sound is gone or inactive stays silent. */
export function resolveGasSounds(
  refs: unknown,
  library: ReadonlyMap<string, Pick<SoundTrack, 'url' | 'isActive'>>
): GasSoundEffectsConfig {
  return resolveSlotSounds(refs, library, GAS_SOUND_SLOTS);
}
