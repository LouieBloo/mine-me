import type { ItemSoundEffectsConfig, ItemSoundSlot } from '../types/sound';

/**
 * Definition for a specific sound effect slot on an item (e.g. throw, fuse loop, explosion).
 */
export class ItemSoundSlotDefinition {
  public readonly slotKey: ItemSoundSlot | string;
  public readonly label: string;
  public readonly description: string;
  public readonly defaultLoop: boolean;
  public readonly loopToggleable: boolean;
  public readonly icon: string;

  constructor(options: {
    slotKey: ItemSoundSlot | string;
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

/**
 * Base abstract class defining the sound profile for an item type/subtype.
 */
export abstract class ItemSoundProfile {
  public abstract readonly subType: string;
  public abstract readonly title: string;
  public abstract readonly description: string;

  /**
   * Returns all available sound effect slots for this item profile.
   */
  public abstract getSlots(): ItemSoundSlotDefinition[];

  /**
   * Retrieves a specific slot definition by its slotKey.
   */
  public getSlot(slotKey: string): ItemSoundSlotDefinition | undefined {
    return this.getSlots().find((slot) => slot.slotKey === slotKey);
  }

  /**
   * Normalizes incoming or database soundEffects configuration, applying defaults
   * and backward-compatible fallbacks (e.g. legacy soundEffectUrl for 'throw').
   */
  public normalizeConfig(rawConfig?: any, legacySoundUrl?: string | null): ItemSoundEffectsConfig {
    const normalized: ItemSoundEffectsConfig = {};
    const slots = this.getSlots();

    for (const slot of slots) {
      const rawSlot = rawConfig?.[slot.slotKey];
      let url = rawSlot?.url;

      // Backward compatibility: if throw slot has no URL in JSON, check legacy soundEffectUrl
      if (slot.slotKey === 'throw' && !url && legacySoundUrl) {
        url = legacySoundUrl;
      }

      normalized[slot.slotKey] = {
        url: url || null,
        loop: rawSlot?.loop !== undefined ? Boolean(rawSlot.loop) : slot.defaultLoop,
      };
    }

    return normalized;
  }
}

/**
 * Sound profile for weapon items (e.g. pickaxes, swords).
 */
export class WeaponSoundProfile extends ItemSoundProfile {
  public readonly subType: string = 'WEAPON';
  public readonly title: string = 'Weapon Sound Effect';
  public readonly description: string = 'Plays in-game when using this weapon to mine blocks (MP3, WAV, OGG, WEBM)';

  public getSlots(): ItemSoundSlotDefinition[] {
    return [
      new ItemSoundSlotDefinition({
        slotKey: 'throw',
        label: 'Weapon Swing / Use',
        description: 'Plays in-game when using this weapon to mine blocks',
        defaultLoop: false,
        loopToggleable: false,
        icon: '⚔️',
      }),
    ];
  }
}

/**
 * Sound profile for dynamite items with throw, fuse burning, and explosion slots.
 */
export class DynamiteSoundProfile extends ItemSoundProfile {
  public readonly subType: string = 'DYNAMITE';
  public readonly title: string = 'Dynamite Sound Effects';
  public readonly description: string =
    'Configure dynamic audio cues for throwing, ticking burning fuse, and detonating explosions';

  public getSlots(): ItemSoundSlotDefinition[] {
    return [
      new ItemSoundSlotDefinition({
        slotKey: 'throw',
        label: 'Throw Sound',
        description: 'Plays upon dynamite release when thrown (activate sound)',
        defaultLoop: false,
        loopToggleable: false,
        icon: '🎯',
      }),
      new ItemSoundSlotDefinition({
        slotKey: 'inGameEffect',
        label: 'In-Game Effect (Fuse)',
        description: 'Plays while dynamite is ticking and fuse is burning in continuous space',
        defaultLoop: true,
        loopToggleable: true,
        icon: '🔥',
      }),
      new ItemSoundSlotDefinition({
        slotKey: 'explosion',
        label: 'Explosion Sound',
        description: 'Plays upon detonation and cavern destruction burst',
        defaultLoop: false,
        loopToggleable: false,
        icon: '💥',
      }),
    ];
  }
}

/**
 * Registry / Factory for item sound profiles.
 * Allows adding new item profiles modularly without changing consumer UI.
 */
export class ItemSoundProfileRegistry {
  private static profiles: Map<string, ItemSoundProfile> = new Map();

  static {
    // Register built-in default profiles
    ItemSoundProfileRegistry.register(new WeaponSoundProfile());
    ItemSoundProfileRegistry.register(new DynamiteSoundProfile());
  }

  public static register(profile: ItemSoundProfile): void {
    ItemSoundProfileRegistry.profiles.set(profile.subType.toUpperCase(), profile);
  }

  public static getProfile(subType?: string | null): ItemSoundProfile | null {
    if (!subType) return null;
    return ItemSoundProfileRegistry.profiles.get(subType.trim().toUpperCase()) ?? null;
  }

  public static hasProfile(subType?: string | null): boolean {
    return ItemSoundProfileRegistry.getProfile(subType) !== null;
  }

  public static getAllProfiles(): ItemSoundProfile[] {
    return Array.from(ItemSoundProfileRegistry.profiles.values());
  }
}
