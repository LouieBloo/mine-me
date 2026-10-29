import type { SoundTrack, SurfaceSoundEffectsConfig, SurfaceSoundSlot, SurfaceSoundSlotRefs } from '../types/sound';
import { SoundSlotDefinition, normalizeSlotRefs, resolveSlotSounds } from './soundSlots';

/** One sound slot every surface environment has. Adding a slot here adds it to the admin; its trigger goes in the client. */
export class SurfaceSoundSlotDefinition extends SoundSlotDefinition<SurfaceSoundSlot> {}

export const SURFACE_SOUND_SLOTS: readonly SurfaceSoundSlotDefinition[] = [
  new SurfaceSoundSlotDefinition({
    slotKey: 'rain',
    label: 'Rain',
    description: 'Loops while it rains or storms on the surface; louder with heavier rain, fading and muffled with depth',
    icon: '🌧️',
    defaultLoop: true,
  }),
  new SurfaceSoundSlotDefinition({
    slotKey: 'wind',
    label: 'Wind',
    description: 'Loops while the wind blows on the surface; louder with stronger wind, fading and muffled with depth',
    icon: '💨',
    defaultLoop: true,
  }),
  new SurfaceSoundSlotDefinition({
    slotKey: 'thunder',
    label: 'Thunder',
    description: 'Plays after each lightning flash, later the farther away the strike is',
    icon: '⛈️',
  }),
];

export const SURFACE_SOUND_SLOT_KEYS: readonly SurfaceSoundSlot[] = SURFACE_SOUND_SLOTS.map((s) => s.slotKey);

export function getSurfaceSoundSlot(slotKey: string): SurfaceSoundSlotDefinition | undefined {
  return SURFACE_SOUND_SLOTS.find((s) => s.slotKey === slotKey);
}

export function isSurfaceSoundSlot(slotKey: unknown): slotKey is SurfaceSoundSlot {
  return typeof slotKey === 'string' && SURFACE_SOUND_SLOT_KEYS.includes(slotKey as SurfaceSoundSlot);
}

/** Cleans stored/incoming slot references: unknown slots are dropped, and each slot keeps only a sound id and a volume. */
export function normalizeSurfaceSoundRefs(raw: unknown): SurfaceSoundSlotRefs {
  return normalizeSlotRefs(raw, SURFACE_SOUND_SLOTS);
}

/** Turns slot references into playable slots using the sound library; a slot whose sound is gone or inactive stays silent. */
export function resolveSurfaceSounds(
  refs: unknown,
  library: ReadonlyMap<string, Pick<SoundTrack, 'url' | 'isActive'>>
): SurfaceSoundEffectsConfig {
  return resolveSlotSounds(refs, library, SURFACE_SOUND_SLOTS);
}
