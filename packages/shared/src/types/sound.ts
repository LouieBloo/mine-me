import { BLOCK_SCALE } from './mining';

export type SoundType = 'BGM' | 'SFX';

/** Where a library sound is used. Music is `type: 'BGM'`; sound effects are grouped by what plays them. */
export type SoundCategory = 'GENERAL' | 'ITEM' | 'BLOCK' | 'MOB' | 'CHARACTER' | 'FLUID' | 'GAS';

export const SOUND_CATEGORIES: readonly SoundCategory[] = ['GENERAL', 'ITEM', 'BLOCK', 'MOB', 'CHARACTER', 'FLUID', 'GAS'];

export interface SoundTrack {
  id: string;
  name: string;
  description?: string | null;
  type: SoundType;
  category?: SoundCategory;
  url: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  volume: number;
  loop: boolean;
  isActive: boolean;
  createdAt: string | Date;
  updatedAt: string | Date;
}

export interface SoundSettings {
  bgmEnabled: boolean;
  sfxEnabled: boolean;
  bgmVolume: number; // 0.0 - 1.0 (default 0.7)
  sfxVolume: number; // 0.0 - 1.0 (default 0.9)
}

export const DEFAULT_BGM_VOLUME = 0.7;
export const DEFAULT_SFX_VOLUME = 0.9;

export const DEFAULT_SOUND_SETTINGS: SoundSettings = {
  bgmEnabled: true,
  sfxEnabled: true,
  bgmVolume: DEFAULT_BGM_VOLUME,
  sfxVolume: DEFAULT_SFX_VOLUME,
};

export type ItemSoundSlot = 'throw' | 'inGameEffect' | 'explosion' | 'shoot' | 'reload';

export interface SoundEffectSlotConfig {
  url?: string | null;
  loop?: boolean;
  /** How loud this sound is where it is used, 0 to 1 (1 when absent). Scales the global effects volume. */
  volume?: number;
}

export interface ItemSoundEffectsConfig {
  throw?: SoundEffectSlotConfig;
  inGameEffect?: SoundEffectSlotConfig;
  explosion?: SoundEffectSlotConfig;
  shoot?: SoundEffectSlotConfig;
  reload?: SoundEffectSlotConfig;
  [key: string]: SoundEffectSlotConfig | undefined;
}

export type MobSoundSlot = 'dig' | 'idle' | 'damage' | 'attack' | 'death';

/** What the admin stores for one mob slot: a library sound by id (the url is resolved at load). */
export interface MobSoundSlotRef {
  soundId?: string | null;
  loop?: boolean;
  /** Volume of this sound on this mob, 0 to 1 (1 when absent). */
  volume?: number;
}

export type MobSoundSlotRefs = Partial<Record<MobSoundSlot, MobSoundSlotRef>>;

/** A mob slot after its library sound has been resolved to something the client can play. */
export interface MobSoundSlotResolved extends SoundEffectSlotConfig {
  soundId?: string | null;
  volume?: number;
}

export type MobSoundEffectsConfig = Partial<Record<MobSoundSlot, MobSoundSlotResolved>>;

export type CharacterSoundSlot = 'hurt' | 'jump' | 'land' | 'death' | 'pickup' | 'backpackFull';

/** What the admin stores for one character slot: a library sound by id (the url is resolved at load). */
export interface CharacterSoundSlotRef {
  soundId?: string | null;
  loop?: boolean;
  /** Volume of this sound on the character, 0 to 1 (1 when absent). */
  volume?: number;
}

export type CharacterSoundSlotRefs = Partial<Record<CharacterSoundSlot, CharacterSoundSlotRef>>;

/** A character slot after its library sound has been resolved to something the client can play. */
export interface CharacterSoundSlotResolved extends SoundEffectSlotConfig {
  soundId?: string | null;
  volume?: number;
}

export type CharacterSoundEffectsConfig = Partial<Record<CharacterSoundSlot, CharacterSoundSlotResolved>>;

export type FluidSoundSlot = 'enter' | 'exit' | 'ignite' | 'burn';

/** What the admin stores for one fluid slot: a library sound by id (the url is resolved at load). */
export interface FluidSoundSlotRef {
  soundId?: string | null;
  loop?: boolean;
  /** Volume of this sound on this fluid, 0 to 1 (1 when absent). */
  volume?: number;
}

export type FluidSoundSlotRefs = Partial<Record<FluidSoundSlot, FluidSoundSlotRef>>;

/** A fluid slot after its library sound has been resolved to something the client can play. */
export interface FluidSoundSlotResolved extends SoundEffectSlotConfig {
  soundId?: string | null;
  volume?: number;
}

export type FluidSoundEffectsConfig = Partial<Record<FluidSoundSlot, FluidSoundSlotResolved>>;

export type GasSoundSlot = 'enter' | 'exit' | 'ignite' | 'explode' | 'vent';

/** What the admin stores for one gas slot: a library sound by id (the url is resolved at load). */
export interface GasSoundSlotRef {
  soundId?: string | null;
  loop?: boolean;
  /** Volume of this sound on this gas, 0 to 1 (1 when absent). */
  volume?: number;
}

export type GasSoundSlotRefs = Partial<Record<GasSoundSlot, GasSoundSlotRef>>;

/** A gas slot after its library sound has been resolved to something the client can play. */
export interface GasSoundSlotResolved extends SoundEffectSlotConfig {
  soundId?: string | null;
  volume?: number;
}

export type GasSoundEffectsConfig = Partial<Record<GasSoundSlot, GasSoundSlotResolved>>;

export type AudioFalloffModel = 'linear' | 'quadratic' | 'smoothstep' | 'exponential';

export interface SpatialAudioConfig {
  /** Maximum hearing distance in world/tile units. Beyond this distance, volume is 0. */
  maxDistance?: number;
  /** Inner radius in world/tile units where volume is 100% (no falloff). */
  minDistance?: number;
  /** Rolloff curve model: 'linear' | 'quadratic' | 'smoothstep' | 'exponential' (default 'linear') */
  falloffModel?: AudioFalloffModel;
  /** Max distance for stereo panning clamp (default 12 x the block scale) */
  panRange?: number;
  /** Whether stereo panning is enabled (default true) */
  enablePanning?: boolean;
}

export interface SpatialAudioCalculation {
  /** Effective volume multiplier [0.0, 1.0] after distance attenuation */
  volumeScale: number;
  /** Stereo panning [-1.0, 1.0] from left to right */
  pan: number;
  /** Distance between listener and source */
  distance: number;
  /** Whether the sound is within audible range (distance < maxDistance) */
  isAudible: boolean;
}

export const DEFAULT_SPATIAL_AUDIO_CONFIG: Required<SpatialAudioConfig> = {
  maxDistance: 16 * BLOCK_SCALE,
  minDistance: 2 * BLOCK_SCALE,
  falloffModel: 'linear',
  panRange: 12 * BLOCK_SCALE,
  enablePanning: true,
};

export const MINING_SPATIAL_AUDIO_PRESETS = {
  ITEM_PICKUP: {
    maxDistance: 14 * BLOCK_SCALE,
    minDistance: 2 * BLOCK_SCALE,
    falloffModel: 'linear' as AudioFalloffModel,
    panRange: 10 * BLOCK_SCALE,
    enablePanning: true,
  },
  FLUID_SPLASH: {
    maxDistance: 18 * BLOCK_SCALE,
    minDistance: 2 * BLOCK_SCALE,
    falloffModel: 'linear' as AudioFalloffModel,
    panRange: 12 * BLOCK_SCALE,
    enablePanning: true,
  },
  GAS_ENTER: {
    maxDistance: 14 * BLOCK_SCALE,
    minDistance: 2 * BLOCK_SCALE,
    falloffModel: 'linear' as AudioFalloffModel,
    panRange: 10 * BLOCK_SCALE,
    enablePanning: true,
  },
  GAS_IGNITE: {
    maxDistance: 18 * BLOCK_SCALE,
    minDistance: 2 * BLOCK_SCALE,
    falloffModel: 'linear' as AudioFalloffModel,
    panRange: 12 * BLOCK_SCALE,
    enablePanning: true,
  },
  GAS_EXPLOSION: {
    maxDistance: 28 * BLOCK_SCALE,
    minDistance: 3 * BLOCK_SCALE,
    falloffModel: 'linear' as AudioFalloffModel,
    panRange: 16 * BLOCK_SCALE,
    enablePanning: true,
  },
  GAS_VENT: {
    maxDistance: 16 * BLOCK_SCALE,
    minDistance: 2 * BLOCK_SCALE,
    falloffModel: 'linear' as AudioFalloffModel,
    panRange: 12 * BLOCK_SCALE,
    enablePanning: true,
  },
  FIRE_IGNITE: {
    maxDistance: 16 * BLOCK_SCALE,
    minDistance: 2 * BLOCK_SCALE,
    falloffModel: 'linear' as AudioFalloffModel,
    panRange: 12 * BLOCK_SCALE,
    enablePanning: true,
  },
  FIRE_CRACKLE: {
    maxDistance: 12 * BLOCK_SCALE,
    minDistance: 1.5,
    falloffModel: 'linear' as AudioFalloffModel,
    panRange: 10 * BLOCK_SCALE,
    enablePanning: true,
  },
  BLOCK_MINING: {
    maxDistance: 16 * BLOCK_SCALE,
    minDistance: 2 * BLOCK_SCALE,
    falloffModel: 'linear' as AudioFalloffModel,
    panRange: 12 * BLOCK_SCALE,
    enablePanning: true,
  },
  DYNAMITE_EXPLOSION: {
    maxDistance: 32 * BLOCK_SCALE,
    minDistance: 4 * BLOCK_SCALE,
    falloffModel: 'linear' as AudioFalloffModel,
    panRange: 16 * BLOCK_SCALE,
    enablePanning: true,
  },
  DYNAMITE_FUSE: {
    maxDistance: 14 * BLOCK_SCALE,
    minDistance: 1.5,
    falloffModel: 'linear' as AudioFalloffModel,
    panRange: 10 * BLOCK_SCALE,
    enablePanning: true,
  },
  MOB_DIGGING: {
    maxDistance: 16 * BLOCK_SCALE,
    minDistance: 2 * BLOCK_SCALE,
    falloffModel: 'linear' as AudioFalloffModel,
    panRange: 12 * BLOCK_SCALE,
    enablePanning: true,
  },
  MOB_IDLE: {
    maxDistance: 12 * BLOCK_SCALE,
    minDistance: 1.5,
    falloffModel: 'linear' as AudioFalloffModel,
    panRange: 10 * BLOCK_SCALE,
    enablePanning: true,
  },
  MOB_ATTACK: {
    maxDistance: 16 * BLOCK_SCALE,
    minDistance: 2 * BLOCK_SCALE,
    falloffModel: 'linear' as AudioFalloffModel,
    panRange: 12 * BLOCK_SCALE,
    enablePanning: true,
  },
  MOB_DEATH: {
    maxDistance: 18 * BLOCK_SCALE,
    minDistance: 2 * BLOCK_SCALE,
    falloffModel: 'linear' as AudioFalloffModel,
    panRange: 12 * BLOCK_SCALE,
    enablePanning: true,
  },
  MOB_DAMAGE: {
    maxDistance: 18 * BLOCK_SCALE,
    minDistance: 2 * BLOCK_SCALE,
    falloffModel: 'linear' as AudioFalloffModel,
    panRange: 12 * BLOCK_SCALE,
    enablePanning: true,
  },
} as const;


