export type SoundType = 'BGM' | 'SFX';

/** Where a library sound is used. Music is `type: 'BGM'`; sound effects are grouped by what plays them. */
export type SoundCategory = 'GENERAL' | 'ITEM' | 'BLOCK' | 'MOB';

export const SOUND_CATEGORIES: readonly SoundCategory[] = ['GENERAL', 'ITEM', 'BLOCK', 'MOB'];

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
}

export type MobSoundSlotRefs = Partial<Record<MobSoundSlot, MobSoundSlotRef>>;

/** A mob slot after its library sound has been resolved to something the client can play. */
export interface MobSoundSlotResolved extends SoundEffectSlotConfig {
  soundId?: string | null;
  volume?: number;
}

export type MobSoundEffectsConfig = Partial<Record<MobSoundSlot, MobSoundSlotResolved>>;

export type AudioFalloffModel = 'linear' | 'quadratic' | 'smoothstep' | 'exponential';

export interface SpatialAudioConfig {
  /** Maximum hearing distance in world/tile units. Beyond this distance, volume is 0. */
  maxDistance?: number;
  /** Inner radius in world/tile units where volume is 100% (no falloff). */
  minDistance?: number;
  /** Rolloff curve model: 'linear' | 'quadratic' | 'smoothstep' | 'exponential' (default 'linear') */
  falloffModel?: AudioFalloffModel;
  /** Max distance for stereo panning clamp (default 12) */
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
  maxDistance: 16,
  minDistance: 2,
  falloffModel: 'linear',
  panRange: 12,
  enablePanning: true,
};

export const MINING_SPATIAL_AUDIO_PRESETS = {
  BLOCK_MINING: {
    maxDistance: 16,
    minDistance: 2,
    falloffModel: 'linear' as AudioFalloffModel,
    panRange: 12,
    enablePanning: true,
  },
  DYNAMITE_EXPLOSION: {
    maxDistance: 32,
    minDistance: 4,
    falloffModel: 'linear' as AudioFalloffModel,
    panRange: 16,
    enablePanning: true,
  },
  DYNAMITE_FUSE: {
    maxDistance: 14,
    minDistance: 1.5,
    falloffModel: 'linear' as AudioFalloffModel,
    panRange: 10,
    enablePanning: true,
  },
  MOB_DIGGING: {
    maxDistance: 16,
    minDistance: 2,
    falloffModel: 'linear' as AudioFalloffModel,
    panRange: 12,
    enablePanning: true,
  },
  MOB_IDLE: {
    maxDistance: 12,
    minDistance: 1.5,
    falloffModel: 'linear' as AudioFalloffModel,
    panRange: 10,
    enablePanning: true,
  },
  MOB_ATTACK: {
    maxDistance: 16,
    minDistance: 2,
    falloffModel: 'linear' as AudioFalloffModel,
    panRange: 12,
    enablePanning: true,
  },
  MOB_DEATH: {
    maxDistance: 18,
    minDistance: 2,
    falloffModel: 'linear' as AudioFalloffModel,
    panRange: 12,
    enablePanning: true,
  },
  MOB_DAMAGE: {
    maxDistance: 18,
    minDistance: 2,
    falloffModel: 'linear' as AudioFalloffModel,
    panRange: 12,
    enablePanning: true,
  },
} as const;


