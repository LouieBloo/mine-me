import type { FluidSoundEffectsConfig, FluidSoundSlot, FluidSoundSlotRefs, SoundTrack } from '../types/sound';
import { SoundSlotDefinition, normalizeSlotRefs, resolveSlotSounds } from './soundSlots';

/** One sound slot every fluid has (enter, exit...). Adding a slot here adds it to the admin; its trigger goes in the client. */
export class FluidSoundSlotDefinition extends SoundSlotDefinition<FluidSoundSlot> {}

export const FLUID_SOUND_SLOTS: readonly FluidSoundSlotDefinition[] = [
  new FluidSoundSlotDefinition({
    slotKey: 'enter',
    label: 'Enter',
    description: 'Plays when a player or mob wades into this fluid',
    icon: '💦',
  }),
  new FluidSoundSlotDefinition({
    slotKey: 'exit',
    label: 'Exit',
    description: 'Plays when a player or mob climbs out of this fluid',
    icon: '🌊',
  }),
  new FluidSoundSlotDefinition({
    slotKey: 'ignite',
    label: 'Catch Fire',
    description: 'Plays when a cell of this fluid catches fire',
    icon: '🔥',
  }),
  new FluidSoundSlotDefinition({
    slotKey: 'burn',
    label: 'Burning Loop',
    description: 'Loops near this fluid while it burns (a few of the nearest fires at a time)',
    defaultLoop: true,
    icon: '🪵',
  }),
];

export const FLUID_SOUND_SLOT_KEYS: readonly FluidSoundSlot[] = FLUID_SOUND_SLOTS.map((s) => s.slotKey);

export function getFluidSoundSlot(slotKey: string): FluidSoundSlotDefinition | undefined {
  return FLUID_SOUND_SLOTS.find((s) => s.slotKey === slotKey);
}

export function isFluidSoundSlot(slotKey: unknown): slotKey is FluidSoundSlot {
  return typeof slotKey === 'string' && FLUID_SOUND_SLOT_KEYS.includes(slotKey as FluidSoundSlot);
}

/** Cleans stored/incoming slot references: unknown slots are dropped, and each slot keeps only a sound id, volume and (where allowed) loop flag. */
export function normalizeFluidSoundRefs(raw: unknown): FluidSoundSlotRefs {
  return normalizeSlotRefs(raw, FLUID_SOUND_SLOTS);
}

/** Turns slot references into playable slots using the sound library; a slot whose sound is gone or inactive stays silent. */
export function resolveFluidSounds(
  refs: unknown,
  library: ReadonlyMap<string, Pick<SoundTrack, 'url' | 'isActive'>>
): FluidSoundEffectsConfig {
  return resolveSlotSounds(refs, library, FLUID_SOUND_SLOTS);
}
