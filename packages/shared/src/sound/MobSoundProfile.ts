import type {
  MobSoundEffectsConfig,
  MobSoundSlot,
  MobSoundSlotRef,
  MobSoundSlotRefs,
  SoundTrack,
} from '../types/sound';

/** One sound slot every mob has (dig, idle, damage...). Adding a slot here adds it to the admin and the game. */
export class MobSoundSlotDefinition {
  public readonly slotKey: MobSoundSlot;
  public readonly label: string;
  public readonly description: string;
  public readonly defaultLoop: boolean;
  public readonly loopToggleable: boolean;
  public readonly icon: string;

  constructor(options: {
    slotKey: MobSoundSlot;
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
  const out: MobSoundSlotRefs = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const def of MOB_SOUND_SLOTS) {
    const slot = (raw as Record<string, unknown>)[def.slotKey];
    if (!slot || typeof slot !== 'object') continue;
    const { soundId, loop } = slot as Record<string, unknown>;
    if (typeof soundId !== 'string' || soundId.length === 0) continue;
    const ref: MobSoundSlotRef = { soundId };
    if (def.loopToggleable && typeof loop === 'boolean') ref.loop = loop;
    out[def.slotKey] = ref;
  }
  return out;
}

/**
 * Turns slot references into playable slots using the sound library. A slot whose sound is gone
 * or inactive is left out, so the game just stays silent for it.
 */
export function resolveMobSounds(
  refs: unknown,
  library: ReadonlyMap<string, Pick<SoundTrack, 'url' | 'volume' | 'isActive'>>
): MobSoundEffectsConfig {
  const out: MobSoundEffectsConfig = {};
  const normalized = normalizeMobSoundRefs(refs);
  for (const def of MOB_SOUND_SLOTS) {
    const ref = normalized[def.slotKey];
    const sound = ref?.soundId ? library.get(ref.soundId) : undefined;
    if (!ref || !sound || sound.isActive === false) continue;
    out[def.slotKey] = {
      soundId: ref.soundId,
      url: sound.url,
      volume: sound.volume,
      loop: ref.loop ?? def.defaultLoop,
    };
  }
  return out;
}
