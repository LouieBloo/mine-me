import { Howl, Howler } from 'howler';
import {
  type SoundSettings,
  type SoundTrack,
  DEFAULT_BGM_VOLUME,
  DEFAULT_SFX_VOLUME,
  DEFAULT_SOUND_SETTINGS,
  getAssetUrl,
} from '@mine-me/shared';
import { SoundChannel } from './SoundChannel';
import { MusicPlayer } from './MusicPlayer';

const STORAGE_KEY = 'nvg_sound_settings';

export class SoundManager {
  private static instance: SoundManager | null = null;

  public readonly bgmChannel: SoundChannel;
  public readonly sfxChannel: SoundChannel;
  public readonly musicPlayer: MusicPlayer;

  private listeners: Set<(settings: SoundSettings) => void> = new Set();
  private isUnlocked: boolean = false;
  private isFetchingPlaylist: boolean = false;
  private hasPendingBgmPlay: boolean = false;
  private sfxCache: Map<string, Howl> = new Map();

  private constructor() {
    const saved = this.loadSettings();

    this.bgmChannel = new SoundChannel('bgm', saved.bgmVolume, saved.bgmEnabled);
    this.sfxChannel = new SoundChannel('sfx', saved.sfxVolume, saved.sfxEnabled);
    this.musicPlayer = new MusicPlayer(this.bgmChannel);

    this.setupUnlockListeners();
  }

  public static getInstance(): SoundManager {
    if (!SoundManager.instance) {
      SoundManager.instance = new SoundManager();
    }
    return SoundManager.instance;
  }

  /**
   * Initializes audio system and loads active BGM tracks from the public API.
   */
  public async init(force: boolean = false): Promise<void> {
    if (this.isFetchingPlaylist && !force) return;
    this.isFetchingPlaylist = true;

    try {
      const res = await fetch(getAssetUrl('/api/public/sounds/bgm'));
      if (res.ok) {
        const tracks: SoundTrack[] = await res.json();
        this.musicPlayer.setPlaylist(tracks);

        // If BGM was requested while tracks were loading, start playback now!
        if (this.hasPendingBgmPlay && tracks.length > 0 && !this.musicPlayer.getIsPlaying()) {
          this.musicPlayer.play();
        }
      }
    } catch (err) {
      console.warn('[SoundManager] Could not fetch BGM playlist:', err);
    } finally {
      this.isFetchingPlaylist = false;
    }
  }

  /**
   * Browser autoplay policy requires user interaction before audio plays.
   */
  private setupUnlockListeners(): void {
    if (typeof window === 'undefined') return;

    const unlock = () => {
      if (this.isUnlocked) return;
      this.isUnlocked = true;

      // Resume Howler's AudioContext if suspended
      if (Howler.ctx && Howler.ctx.state === 'suspended') {
        Howler.ctx.resume().catch(() => {});
      }

      // If pending music playback was held up by autoplay restrictions, resume it
      if (this.hasPendingBgmPlay && !this.musicPlayer.getIsPlaying()) {
        this.musicPlayer.resume();
      }

      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('touchstart', unlock);
    };

    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock, { passive: true });
    window.addEventListener('touchstart', unlock, { passive: true });
  }

  public getSettings(): SoundSettings {
    return {
      bgmEnabled: this.bgmChannel.isEnabled(),
      sfxEnabled: this.sfxChannel.isEnabled(),
      bgmVolume: this.bgmChannel.getVolume(),
      sfxVolume: this.sfxChannel.getVolume(),
    };
  }

  private loadSettings(): SoundSettings {
    if (typeof window === 'undefined') return DEFAULT_SOUND_SETTINGS;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          bgmEnabled: parsed.bgmEnabled ?? DEFAULT_SOUND_SETTINGS.bgmEnabled,
          sfxEnabled: parsed.sfxEnabled ?? DEFAULT_SOUND_SETTINGS.sfxEnabled,
          bgmVolume: typeof parsed.bgmVolume === 'number' ? parsed.bgmVolume : DEFAULT_BGM_VOLUME,
          sfxVolume: typeof parsed.sfxVolume === 'number' ? parsed.sfxVolume : DEFAULT_SFX_VOLUME,
        };
      }
    } catch (err) {
      console.warn('[SoundManager] Failed to read audio settings from localStorage:', err);
    }
    return DEFAULT_SOUND_SETTINGS;
  }

  private saveSettings(): void {
    const current = this.getSettings();
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
      } catch (err) {
        console.warn('[SoundManager] Failed to save audio settings:', err);
      }
    }
    this.notifyListeners(current);
  }

  public setBgmVolume(volume: number): void {
    this.bgmChannel.setVolume(volume);
    this.saveSettings();
  }

  public setSfxVolume(volume: number): void {
    this.sfxChannel.setVolume(volume);
    this.saveSettings();
  }

  public toggleBgm(): boolean {
    const state = this.bgmChannel.toggle();
    this.saveSettings();
    return state;
  }

  public toggleSfx(): boolean {
    const state = this.sfxChannel.toggle();
    this.saveSettings();
    return state;
  }

  public async playBgm(trackUrl?: string): Promise<void> {
    this.hasPendingBgmPlay = true;

    // Resume AudioContext if suspended
    if (Howler.ctx && Howler.ctx.state === 'suspended') {
      try {
        await Howler.ctx.resume();
      } catch {}
    }

    if (trackUrl) {
      const customTrack: SoundTrack = {
        id: 'direct_bgm',
        name: 'Direct Track',
        type: 'BGM',
        url: trackUrl,
        fileName: 'track.mp3',
        fileSize: 0,
        mimeType: 'audio/mpeg',
        volume: 1.0,
        loop: true,
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      this.musicPlayer.setPlaylist([customTrack]);
      this.musicPlayer.play(0);
      return;
    }

    // If tracks are not loaded yet, fetch them and auto-play when ready
    if (this.musicPlayer.getPlaylist().length === 0) {
      await this.init(true);
    } else {
      this.musicPlayer.resume();
    }
  }

  /**
   * Resets and starts background music for a new mining session with a random track.
   */
  public async startSessionBgm(): Promise<void> {
    this.hasPendingBgmPlay = true;

    if (Howler.ctx && Howler.ctx.state === 'suspended') {
      try {
        await Howler.ctx.resume();
      } catch {}
    }

    if (this.musicPlayer.getPlaylist().length === 0) {
      await this.init(true);
    }

    this.musicPlayer.startNewSession();
  }

  public stopBgm(): void {
    this.hasPendingBgmPlay = false;
    this.musicPlayer.stop();
  }

  /**
   * Plays a single-shot sound effect on the SFX channel.
   */
  public playSfx(srcUrl: string, volumeScale: number = 1.0): Howl | null {
    if (!this.sfxChannel.isEnabled() || this.sfxChannel.getVolume() <= 0) {
      return null;
    }

    const fullUrl = getAssetUrl(srcUrl);
    let howl = this.sfxCache.get(fullUrl);

    if (!howl) {
      howl = new Howl({
        src: [fullUrl],
        volume: this.sfxChannel.getEffectiveVolume() * volumeScale,
      });
      this.sfxCache.set(fullUrl, howl);
    } else {
      howl.volume(this.sfxChannel.getEffectiveVolume() * volumeScale);
    }

    this.sfxChannel.register(howl, volumeScale);
    howl.play();
    return howl;
  }

  public subscribe(listener: (settings: SoundSettings) => void): () => void {
    this.listeners.add(listener);
    // Initial call
    listener(this.getSettings());
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(settings: SoundSettings): void {
    for (const listener of this.listeners) {
      listener(settings);
    }
  }
}

export const soundManager = SoundManager.getInstance();
