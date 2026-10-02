import { Howl, Howler } from 'howler';
import {
  type SoundSettings,
  type SoundTrack,
  type SpatialAudioConfig,
  type Vector2D,
  DEFAULT_BGM_VOLUME,
  DEFAULT_SFX_VOLUME,
  DEFAULT_SOUND_SETTINGS,
  calculateSpatialAudio,
  getAssetUrl,
} from '@mine-me/shared';
import { SoundChannel } from './SoundChannel';
import { MusicPlayer } from './MusicPlayer';

const STORAGE_KEY = 'nvg_sound_settings';

export interface PlaySfxOptions {
  volumeScale?: number;
  throttleMs?: number;
  position?: Vector2D;
  spatial?: SpatialAudioConfig;
  listenerPosition?: Vector2D;
}

export interface PlayLoopingSfxOptions {
  volumeScale?: number;
  position?: Vector2D;
  spatial?: SpatialAudioConfig;
}

interface LoopingSfxEntry {
  howl: Howl;
  baseVolumeScale: number;
  effectiveVolumeScale: number;
  position?: Vector2D;
  spatial?: SpatialAudioConfig;
}

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
  private sfxLastPlayTimes: Map<string, number> = new Map();
  private recentSfxTimes: number[] = [];
  private listenerPosition: Vector2D | null = null;
  private static readonly DEFAULT_THROTTLE_MS = 75;
  private static readonly MAX_CONCURRENT_BURST = 4;
  private static readonly BURST_WINDOW_MS = 60;

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
   * Updates listener (player) position used for spatial audio falloff and stereo panning.
   */
  public setListenerPosition(pos: Vector2D | null): void {
    if (!pos) {
      this.listenerPosition = null;
    } else {
      this.listenerPosition = { x: pos.x, y: pos.y };
    }
    this.updateLoopingSfxVolumes();
  }

  /**
   * Gets current listener (player) position, or null if unassigned.
   */
  public getListenerPosition(): Vector2D | null {
    return this.listenerPosition ? { ...this.listenerPosition } : null;
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
   * Plays a single-shot sound effect on the SFX channel with built-in deduplication,
   * burst protection, and optional spatial distance falloff / stereo panning.
   * If a source position is provided and is beyond max hearing distance, returns null without playing.
   */
  public playSfx(srcUrl: string, optionsOrVolume: number | PlaySfxOptions = 1.0): Howl | null {
    if (!this.sfxChannel.isEnabled() || this.sfxChannel.getVolume() <= 0) {
      return null;
    }

    const options: PlaySfxOptions =
      typeof optionsOrVolume === 'number'
        ? { volumeScale: optionsOrVolume }
        : optionsOrVolume;

    let volumeScale = options.volumeScale ?? 1.0;
    let pan = 0.0;

    // Apply spatial falloff and stereo panning if a source position is given
    if (options.position) {
      const listener = options.listenerPosition ?? this.listenerPosition;
      if (listener) {
        const spatial = calculateSpatialAudio(listener, options.position, options.spatial);
        if (!spatial.isAudible) {
          // Beyond max hearing distance: do not play or allocate sound
          return null;
        }
        volumeScale *= spatial.volumeScale;
        pan = spatial.pan;
      }
    }

    if (volumeScale <= 0) {
      return null;
    }

    const throttleMs = options.throttleMs ?? SoundManager.DEFAULT_THROTTLE_MS;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();

    // 1. Per-sound throttle (suppress duplicate instances of the same sound within throttleMs)
    if (throttleMs > 0) {
      const lastPlay = this.sfxLastPlayTimes.get(srcUrl) ?? 0;
      if (now - lastPlay < throttleMs) {
        return null;
      }
    }

    // 2. Global burst rate-limiter: prevent audio distortion when many distinct sounds trigger simultaneously
    this.recentSfxTimes = this.recentSfxTimes.filter(t => now - t < SoundManager.BURST_WINDOW_MS);
    if (this.recentSfxTimes.length >= SoundManager.MAX_CONCURRENT_BURST) {
      return null;
    }

    this.sfxLastPlayTimes.set(srcUrl, now);
    this.recentSfxTimes.push(now);

    if (Howler.ctx && Howler.ctx.state === 'suspended') {
      Howler.ctx.resume().catch(() => {});
    }

    const fullUrl = getAssetUrl(srcUrl);
    let howl = this.sfxCache.get(fullUrl);

    if (!howl) {
      howl = new Howl({
        src: [fullUrl],
        volume: this.sfxChannel.getEffectiveVolume() * volumeScale,
        onloaderror: (_id, err) => {
          console.warn(`[SoundManager] Failed to load SFX "${fullUrl}":`, err);
        },
        onplayerror: (_id, err) => {
          console.warn(`[SoundManager] Playback blocked for SFX "${fullUrl}":`, err);
          howl?.once('unlock', () => {
            howl?.play();
          });
        },
      });
      this.sfxCache.set(fullUrl, howl);
    } else {
      howl.volume(this.sfxChannel.getEffectiveVolume() * volumeScale);
    }

    this.sfxChannel.register(howl, volumeScale);
    howl.play();

    if (pan !== 0 && typeof (howl as any).stereo === 'function') {
      try {
        (howl as any).stereo(pan);
      } catch {}
    }

    return howl;
  }

  /**
   * Convenience method to play a sound at a specific 2D position with distance falloff.
   */
  public playPositionalSfx(
    srcUrl: string,
    position: Vector2D,
    options?: PlaySfxOptions
  ): Howl | null {
    return this.playSfx(srcUrl, {
      ...options,
      position,
    });
  }

  private loopingSfx: Map<string, LoopingSfxEntry> = new Map();

  /**
   * Plays a continuous looping sound effect on the SFX channel under a unique key,
   * supporting optional spatial attenuation and stereo panning.
   */
  public playLoopingSfx(
    key: string,
    srcUrl: string,
    optionsOrVolume: number | PlayLoopingSfxOptions = 1.0
  ): Howl | null {
    if (!this.sfxChannel.isEnabled() || this.sfxChannel.getVolume() <= 0) {
      return null;
    }

    const options: PlayLoopingSfxOptions =
      typeof optionsOrVolume === 'number'
        ? { volumeScale: optionsOrVolume }
        : optionsOrVolume;

    const baseVolumeScale = options.volumeScale ?? 1.0;
    let effectiveVolumeScale = baseVolumeScale;
    let pan = 0.0;

    if (options.position && this.listenerPosition) {
      const spatial = calculateSpatialAudio(this.listenerPosition, options.position, options.spatial);
      effectiveVolumeScale = spatial.isAudible ? baseVolumeScale * spatial.volumeScale : 0;
      pan = spatial.pan;
    }

    const existing = this.loopingSfx.get(key);
    if (existing) {
      existing.baseVolumeScale = baseVolumeScale;
      existing.effectiveVolumeScale = effectiveVolumeScale;
      existing.position = options.position;
      existing.spatial = options.spatial;
      existing.howl.volume(this.sfxChannel.getEffectiveVolume() * effectiveVolumeScale);
      if (pan !== 0 && typeof (existing.howl as any).stereo === 'function') {
        try {
          (existing.howl as any).stereo(pan);
        } catch {}
      }
      return existing.howl;
    }

    if (Howler.ctx && Howler.ctx.state === 'suspended') {
      Howler.ctx.resume().catch(() => {});
    }

    const fullUrl = getAssetUrl(srcUrl);
    const howl = new Howl({
      src: [fullUrl],
      loop: true,
      volume: this.sfxChannel.getEffectiveVolume() * effectiveVolumeScale,
      onloaderror: (_id, err) => {
        console.warn(`[SoundManager] Failed to load looping SFX "${fullUrl}":`, err);
      },
      onplayerror: (_id, err) => {
        console.warn(`[SoundManager] Playback blocked for looping SFX "${fullUrl}":`, err);
        howl?.once('unlock', () => {
          howl?.play();
        });
      },
    });

    this.sfxChannel.register(howl, effectiveVolumeScale);
    howl.play();

    if (pan !== 0 && typeof (howl as any).stereo === 'function') {
      try {
        (howl as any).stereo(pan);
      } catch {}
    }

    this.loopingSfx.set(key, {
      howl,
      baseVolumeScale,
      effectiveVolumeScale,
      position: options.position,
      spatial: options.spatial,
    });
    return howl;
  }

  /**
   * Updates position and recalculates volume/pan for an active looping sound.
   */
  public updateLoopingSfxPosition(
    key: string,
    position: Vector2D,
    spatial?: SpatialAudioConfig
  ): void {
    const entry = this.loopingSfx.get(key);
    if (!entry) return;

    entry.position = position;
    if (spatial) entry.spatial = spatial;

    if (!this.listenerPosition) {
      entry.effectiveVolumeScale = entry.baseVolumeScale;
      entry.howl.volume(this.sfxChannel.getEffectiveVolume() * entry.effectiveVolumeScale);
      return;
    }

    const calc = calculateSpatialAudio(this.listenerPosition, position, entry.spatial);
    entry.effectiveVolumeScale = calc.isAudible ? entry.baseVolumeScale * calc.volumeScale : 0;
    entry.howl.volume(this.sfxChannel.getEffectiveVolume() * entry.effectiveVolumeScale);

    if (typeof (entry.howl as any).stereo === 'function') {
      try {
        (entry.howl as any).stereo(calc.pan);
      } catch {}
    }
  }

  /**
   * Recalculates volume and panning for all active spatial looping sounds when listener moves.
   */
  private updateLoopingSfxVolumes(): void {
    if (this.loopingSfx.size === 0) return;

    for (const [, entry] of this.loopingSfx.entries()) {
      if (!entry.position) continue;
      if (!this.listenerPosition) {
        entry.effectiveVolumeScale = entry.baseVolumeScale;
      } else {
        const calc = calculateSpatialAudio(this.listenerPosition, entry.position, entry.spatial);
        entry.effectiveVolumeScale = calc.isAudible ? entry.baseVolumeScale * calc.volumeScale : 0;
        if (typeof (entry.howl as any).stereo === 'function') {
          try {
            (entry.howl as any).stereo(calc.pan);
          } catch {}
        }
      }
      entry.howl.volume(this.sfxChannel.getEffectiveVolume() * entry.effectiveVolumeScale);
    }
  }

  /**
   * Stops and releases an active looping sound effect by key.
   */
  public stopLoopingSfx(key: string): void {
    const entry = this.loopingSfx.get(key);
    if (entry) {
      entry.howl.stop();
      this.sfxChannel.unregister(entry.howl);
      this.loopingSfx.delete(key);
    }
  }

  /**
   * Checks whether a looping SFX is currently tracked as active.
   */
  public isLoopingSfxPlaying(key: string): boolean {
    return this.loopingSfx.has(key);
  }

  /**
   * Stops all active looping sound effects (e.g. on unmount or scene change).
   */
  public stopAllLoopingSfx(): void {
    for (const [, entry] of this.loopingSfx.entries()) {
      entry.howl.stop();
      this.sfxChannel.unregister(entry.howl);
    }
    this.loopingSfx.clear();
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
