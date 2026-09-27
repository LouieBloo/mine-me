export type SoundType = 'BGM' | 'SFX';

export interface SoundTrack {
  id: string;
  name: string;
  description?: string | null;
  type: SoundType;
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
