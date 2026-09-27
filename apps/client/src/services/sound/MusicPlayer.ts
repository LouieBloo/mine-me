import { Howl } from 'howler';
import type { SoundTrack } from '@mine-me/shared';
import { getAssetUrl } from '@mine-me/shared';
import { SoundChannel } from './SoundChannel';

export class MusicPlayer {
  private playlist: SoundTrack[] = [];
  private currentTrackIndex: number = -1;
  private currentHowl: Howl | null = null;
  private isPlaying: boolean = false;
  private lastPlayedTrackId: string | null = null;

  private readonly channel: SoundChannel;

  constructor(channel: SoundChannel) {
    this.channel = channel;
  }

  public setPlaylist(tracks: SoundTrack[]): void {
    this.playlist = tracks.filter(t => t.isActive);
  }

  public getPlaylist(): SoundTrack[] {
    return [...this.playlist];
  }

  public getCurrentTrack(): SoundTrack | null {
    if (this.currentTrackIndex >= 0 && this.currentTrackIndex < this.playlist.length) {
      return this.playlist[this.currentTrackIndex];
    }
    return null;
  }

  /**
   * Selects a random track index from the playlist.
   * If there are 2 or more tracks, prevents selecting excludeTrackId back-to-back.
   */
  public getRandomIndex(excludeTrackId?: string | null): number {
    if (this.playlist.length === 0) return -1;
    if (this.playlist.length === 1) return 0;

    const candidates = this.playlist
      .map((track, idx) => ({ track, idx }))
      .filter(item => item.track.id !== excludeTrackId);

    const pool = candidates.length > 0
      ? candidates
      : this.playlist.map((track, idx) => ({ track, idx }));

    const picked = pool[Math.floor(Math.random() * pool.length)];
    return picked.idx;
  }

  /**
   * Plays a random track from the playlist, avoiding the currently playing track.
   */
  public playRandom(excludeCurrent: boolean = true): void {
    if (this.playlist.length === 0) return;
    const excludeId = excludeCurrent && this.currentTrackIndex >= 0
      ? this.playlist[this.currentTrackIndex]?.id
      : null;
    const nextIdx = this.getRandomIndex(excludeId);
    this.play(nextIdx);
  }

  /**
   * Resets and starts background music for a new session with a random track.
   */
  public startNewSession(): void {
    if (this.playlist.length === 0) return;

    // Fade out and stop any existing track immediately
    if (this.currentHowl) {
      this.currentHowl.stop();
      this.currentHowl.unload();
      this.currentHowl = null;
      this.isPlaying = false;
    }

    // Pick a random track avoiding the track from the previous session if possible
    const nextIdx = this.getRandomIndex(this.lastPlayedTrackId);
    this.play(nextIdx);
  }

  public play(index?: number): void {
    if (this.playlist.length === 0) {
      return;
    }

    // If no index provided, pick a random track
    const targetIndex = index !== undefined
      ? ((index % this.playlist.length) + this.playlist.length) % this.playlist.length
      : this.getRandomIndex(this.lastPlayedTrackId);

    if (targetIndex < 0 || targetIndex >= this.playlist.length) {
      return;
    }

    // If same track is already playing, do nothing
    if (this.currentHowl && this.currentTrackIndex === targetIndex && this.isPlaying) {
      return;
    }

    // Stop existing howl with fade out
    if (this.currentHowl) {
      const oldHowl = this.currentHowl;
      this.channel.fade(oldHowl, oldHowl.volume(), 0, 800);
      setTimeout(() => {
        oldHowl.stop();
        oldHowl.unload();
      }, 800);
      this.currentHowl = null;
    }

    const track = this.playlist[targetIndex];
    this.currentTrackIndex = targetIndex;
    this.lastPlayedTrackId = track.id;

    const fullUrl = getAssetUrl(track.url);
    const trackVolumeScale = track.volume ?? 1.0;
    const initialVolume = this.channel.getEffectiveVolume() * trackVolumeScale;

    const howl = new Howl({
      src: [fullUrl],
      loop: this.playlist.length === 1,
      volume: initialVolume,
      autoplay: false,
      onend: () => {
        // When track finishes, choose another random track (preventing duplicate back-to-back)
        if (this.playlist.length > 1) {
          this.playRandom(true);
        }
      },
      onloaderror: (_id, err) => {
        console.warn(`[MusicPlayer] Failed to load track "${track.name}" (${fullUrl}):`, err);
      },
      onplayerror: (_id, err) => {
        console.warn(`[MusicPlayer] Playback error/autoplay blocked for track "${track.name}":`, err);
        // Automatically start playing once the player interacts with the page
        howl.once('unlock', () => {
          howl.play();
        });
      }
    });

    this.currentHowl = howl;
    this.channel.register(howl, trackVolumeScale);

    howl.play();
    this.isPlaying = true;
  }

  public pause(): void {
    if (this.currentHowl && this.isPlaying) {
      this.currentHowl.pause();
      this.isPlaying = false;
    }
  }

  public resume(): void {
    if (this.currentHowl && !this.isPlaying) {
      this.currentHowl.play();
      this.isPlaying = true;
    } else if (!this.currentHowl || !this.isPlaying) {
      this.playRandom(false);
    }
  }

  public stop(): void {
    if (this.currentHowl) {
      const oldHowl = this.currentHowl;
      this.channel.fade(oldHowl, oldHowl.volume(), 0, 600);
      setTimeout(() => {
        oldHowl.stop();
        oldHowl.unload();
      }, 600);
      this.currentHowl = null;
      this.isPlaying = false;
    }
  }

  public next(): void {
    // Next moves to a random song with duplicate prevention
    this.playRandom(true);
  }

  public prev(): void {
    this.playRandom(true);
  }

  public getIsPlaying(): boolean {
    return this.isPlaying;
  }
}
