import type { MobSoundEffectsConfig, MobSoundSlot } from '../types/sound';

/**
 * Definition for a specific sound effect slot on a mob (e.g. dig, idle, damage).
 */
export class MobSoundSlotDefinition {
  public readonly slotKey: MobSoundSlot | string;
  public readonly label: string;
  public readonly description: string;
  public readonly defaultLoop: boolean;
  public readonly loopToggleable: boolean;
  public readonly defaultUrl?: string | null;
  public readonly icon: string;

  constructor(options: {
    slotKey: MobSoundSlot | string;
    label: string;
    description: string;
    defaultLoop?: boolean;
    loopToggleable?: boolean;
    defaultUrl?: string | null;
    icon?: string;
  }) {
    this.slotKey = options.slotKey;
    this.label = options.label;
    this.description = options.description;
    this.defaultLoop = options.defaultLoop ?? false;
    this.loopToggleable = options.loopToggleable ?? false;
    this.defaultUrl = options.defaultUrl ?? null;
    this.icon = options.icon ?? '🔊';
  }
}

/**
 * Base abstract class defining the sound profile for a mob species/type.
 */
export abstract class MobSoundProfile {
  public abstract readonly mobId: string;
  public abstract readonly title: string;
  public abstract readonly description: string;

  /**
   * Returns all available sound effect slots for this mob profile.
   */
  public abstract getSlots(): MobSoundSlotDefinition[];

  /**
   * Retrieves a specific slot definition by its slotKey.
   */
  public getSlot(slotKey: string): MobSoundSlotDefinition | undefined {
    return this.getSlots().find((slot) => slot.slotKey === slotKey);
  }

  /**
   * Checks whether a slotKey exists on this sound profile.
   */
  public hasSlot(slotKey: string): boolean {
    return this.getSlot(slotKey) !== undefined;
  }

  /**
   * Normalizes incoming or database sound configuration, applying defaults.
   */
  public normalizeConfig(rawConfig?: any): MobSoundEffectsConfig {
    const normalized: MobSoundEffectsConfig = {};
    const slots = this.getSlots();

    for (const slot of slots) {
      const rawSlot = rawConfig?.[slot.slotKey];
      const url = rawSlot?.url ?? slot.defaultUrl ?? null;

      normalized[slot.slotKey] = {
        url,
        loop: rawSlot?.loop !== undefined ? Boolean(rawSlot.loop) : slot.defaultLoop,
      };
    }

    return normalized;
  }
}

/**
 * Generic mob sound profile with dynamically configurable slots.
 */
export class GenericMobSoundProfile extends MobSoundProfile {
  public readonly mobId: string;
  public readonly title: string;
  public readonly description: string;
  private slotDefinitions: MobSoundSlotDefinition[] = [];

  constructor(mobId: string, title?: string, description?: string) {
    super();
    this.mobId = mobId;
    this.title = title ?? `${mobId} Sound Effects`;
    this.description = description ?? `Sound effects configuration for ${mobId}`;
  }

  public registerSlot(
    options:
      | {
          slotKey: MobSoundSlot | string;
          label: string;
          description: string;
          defaultLoop?: boolean;
          loopToggleable?: boolean;
          defaultUrl?: string | null;
          icon?: string;
        }
      | MobSoundSlotDefinition
  ): void {
    const def =
      options instanceof MobSoundSlotDefinition
        ? options
        : new MobSoundSlotDefinition(options);
    const existingIndex = this.slotDefinitions.findIndex((s) => s.slotKey === def.slotKey);
    if (existingIndex >= 0) {
      this.slotDefinitions[existingIndex] = def;
    } else {
      this.slotDefinitions.push(def);
    }
  }

  public getSlots(): MobSoundSlotDefinition[] {
    return [...this.slotDefinitions];
  }
}

/**
 * Sound profile for the subterranean Mole Person (cmn_mole_person_001).
 * Features claw whoosh digging, blind creature snuffle idle, and hurt reaction sound.
 */
export class MolePersonSoundProfile extends MobSoundProfile {
  public readonly mobId: string = 'cmn_mole_person_001';
  public readonly title: string = 'Mole Person Sound Effects';
  public readonly description: string =
    'Audio profile for blind subterranean mole person: claw digging whooshes, ambient idle snuffles, and damage reactions';

  public getSlots(): MobSoundSlotDefinition[] {
    return [
      new MobSoundSlotDefinition({
        slotKey: 'dig',
        label: 'Hand Digging / Whoosh',
        description: 'Plays in-game when the mole person mines blocks with its bare claws',
        defaultLoop: false,
        loopToggleable: false,
        defaultUrl: '/assets/sounds/cmn_mole_person_dig.mp3',
        icon: '🐾',
      }),
      new MobSoundSlotDefinition({
        slotKey: 'idle',
        label: 'Ambient Idle / Snuffle',
        description: 'Plays periodically while the mole person patrols or idles in the dark caverns',
        defaultLoop: false,
        loopToggleable: false,
        defaultUrl: '/assets/sounds/cmn_mole_person_idle.mp3',
        icon: '👃',
      }),
      new MobSoundSlotDefinition({
        slotKey: 'damage',
        label: 'Damage Reaction / Hurt',
        description: 'Plays when the mole person takes damage from a player or explosive blast',
        defaultLoop: false,
        loopToggleable: false,
        defaultUrl: '/assets/sounds/cmn_mole_person_damage.mp3',
        icon: '💥',
      }),
    ];
  }
}

/**
 * Registry / Factory for mob sound profiles.
 */
export class MobSoundProfileRegistry {
  private static profiles: Map<string, MobSoundProfile> = new Map();

  static {
    MobSoundProfileRegistry.register(new MolePersonSoundProfile());
  }

  public static register(profile: MobSoundProfile): void {
    MobSoundProfileRegistry.profiles.set(profile.mobId.toLowerCase(), profile);
  }

  public static getProfile(mobId?: string | null): MobSoundProfile | null {
    if (!mobId) return null;
    return MobSoundProfileRegistry.profiles.get(mobId.trim().toLowerCase()) ?? null;
  }

  public static hasProfile(mobId?: string | null): boolean {
    return MobSoundProfileRegistry.getProfile(mobId) !== null;
  }

  public static getAllProfiles(): MobSoundProfile[] {
    return Array.from(MobSoundProfileRegistry.profiles.values());
  }

  public static getOrCreateDefault(mobId: string): MobSoundProfile {
    const existing = MobSoundProfileRegistry.getProfile(mobId);
    if (existing) return existing;

    const fallback = new GenericMobSoundProfile(mobId);
    fallback.registerSlot({
      slotKey: 'dig',
      label: 'Digging',
      description: 'Default mining sound',
      defaultUrl: '/assets/sounds/cmn_mole_person_dig.mp3',
    });
    fallback.registerSlot({
      slotKey: 'idle',
      label: 'Idle',
      description: 'Default ambient idle sound',
      defaultUrl: '/assets/sounds/cmn_mole_person_idle.mp3',
    });
    fallback.registerSlot({
      slotKey: 'damage',
      label: 'Damage',
      description: 'Default hurt sound',
      defaultUrl: '/assets/sounds/cmn_mole_person_damage.mp3',
    });
    return fallback;
  }
}

