import type { SoundTrack } from '../types/sound';

/** One sound slot an entity can fill (dig, hurt, jump...). Used by mobs and the player character. */
export class SoundSlotDefinition<K extends string = string> {
  public readonly slotKey: K;
  public readonly label: string;
  public readonly description: string;
  public readonly defaultLoop: boolean;
  public readonly loopToggleable: boolean;
  public readonly icon: string;

  constructor(options: {
    slotKey: K;
    label: string;
    description: string;
    defaultLoop?: boolean;
    loopToggleable?: boolean;
    icon?: string;
  }) {
    this.slotKey = options.slotKey;
    this.label = options.label;
    this.description = options.description;
    this.defaultLoop = options.defaultLoop ?? false;
    this.loopToggleable = options.loopToggleable ?? false;
    this.icon = options.icon ?? '🔊';
  }
}

/** The volume of a sound that has none set. */
export const DEFAULT_SOUND_VOLUME = 1;

/** A usable use-volume: a number from 0 to 1. Anything else (missing, NaN, text) means the default. */
export function clampSoundVolume(volume: unknown): number {
  if (typeof volume !== 'number' || !Number.isFinite(volume)) return DEFAULT_SOUND_VOLUME;
  return Math.min(1, Math.max(0, volume));
}

/** What the admin stores for one slot: a library sound by id (the url is resolved at load) and how loud it is here. */
export interface SoundSlotRefBase {
  soundId?: string | null;
  loop?: boolean;
  /** Volume of the sound in this place, 0 to 1. */
  volume?: number;
}

/** A slot after its library sound has been resolved to something the client can play. */
export interface SoundSlotResolvedBase {
  soundId?: string | null;
  url?: string | null;
  loop?: boolean;
  volume?: number;
}

/** The library sounds a slot can point at. Only where the file is matters: loudness is set per use. */
type Library = ReadonlyMap<string, Pick<SoundTrack, 'url' | 'isActive'>>;

/**
 * Cleans stored/incoming slot references: unknown slots are dropped, and each slot keeps only a
 * sound id and a loop flag (only for slots that allow looping).
 */
export function normalizeSlotRefs<K extends string>(
  raw: unknown,
  definitions: readonly SoundSlotDefinition<K>[]
): Partial<Record<K, SoundSlotRefBase>> {
  const out: Partial<Record<K, SoundSlotRefBase>> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const def of definitions) {
    const slot = (raw as Record<string, unknown>)[def.slotKey];
    if (!slot || typeof slot !== 'object') continue;
    const { soundId, loop, volume } = slot as Record<string, unknown>;
    if (typeof soundId !== 'string' || soundId.length === 0) continue;
    const ref: SoundSlotRefBase = { soundId };
    if (def.loopToggleable && typeof loop === 'boolean') ref.loop = loop;
    if (typeof volume === 'number' && Number.isFinite(volume)) ref.volume = clampSoundVolume(volume);
    out[def.slotKey] = ref;
  }
  return out;
}

/**
 * Turns slot references into playable slots using the sound library. A slot whose sound is gone
 * or inactive is left out, so the game just stays silent for it.
 */
export function resolveSlotSounds<K extends string>(
  refs: unknown,
  library: Library,
  definitions: readonly SoundSlotDefinition<K>[]
): Partial<Record<K, SoundSlotResolvedBase>> {
  const out: Partial<Record<K, SoundSlotResolvedBase>> = {};
  const normalized = normalizeSlotRefs(refs, definitions);
  for (const def of definitions) {
    const ref = normalized[def.slotKey];
    const sound = ref?.soundId ? library.get(ref.soundId) : undefined;
    if (!ref || !sound || sound.isActive === false) continue;
    out[def.slotKey] = {
      soundId: ref.soundId,
      url: sound.url,
      volume: clampSoundVolume(ref.volume),
      loop: ref.loop ?? def.defaultLoop,
    };
  }
  return out;
}
