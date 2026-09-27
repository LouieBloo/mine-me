import { describe, it, expect, beforeEach } from 'vitest';
import { MusicPlayer } from '../MusicPlayer';
import { SoundChannel } from '../SoundChannel';
import type { SoundTrack } from '@mine-me/shared';

describe('MusicPlayer Random Playback & Duplicate Prevention', () => {
  let player: MusicPlayer;
  let channel: SoundChannel;

  const mockTracks: SoundTrack[] = [
    {
      id: 'track_1',
      name: 'Track 1',
      type: 'BGM',
      url: '/assets/sounds/track1.mp3',
      fileName: 'track1.mp3',
      fileSize: 1000,
      mimeType: 'audio/mpeg',
      volume: 0.8,
      loop: true,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'track_2',
      name: 'Track 2',
      type: 'BGM',
      url: '/assets/sounds/track2.mp3',
      fileName: 'track2.mp3',
      fileSize: 1000,
      mimeType: 'audio/mpeg',
      volume: 0.8,
      loop: true,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'track_3',
      name: 'Track 3',
      type: 'BGM',
      url: '/assets/sounds/track3.mp3',
      fileName: 'track3.mp3',
      fileSize: 1000,
      mimeType: 'audio/mpeg',
      volume: 0.8,
      loop: true,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  beforeEach(() => {
    channel = new SoundChannel('bgm', 0.7, true);
    player = new MusicPlayer(channel);
  });

  it('returns -1 for empty playlist and 0 for single-track playlist', () => {
    expect(player.getRandomIndex()).toBe(-1);

    player.setPlaylist([mockTracks[0]]);
    expect(player.getRandomIndex('track_1')).toBe(0);
  });

  it('prevents selecting the excluded track when multiple tracks are available', () => {
    player.setPlaylist(mockTracks);

    // Over 50 random selections excluding track_1, track_1 should never be returned
    for (let i = 0; i < 50; i++) {
      const idx = player.getRandomIndex('track_1');
      expect(player.getPlaylist()[idx].id).not.toBe('track_1');
      expect(['track_2', 'track_3']).toContain(player.getPlaylist()[idx].id);
    }
  });

  it('playRandom avoids back-to-back duplicate of currently playing track', () => {
    player.setPlaylist(mockTracks);

    // Start with track_2
    player.play(1);
    expect(player.getCurrentTrack()?.id).toBe('track_2');

    // Call playRandom with excludeCurrent = true
    player.playRandom(true);
    expect(player.getCurrentTrack()?.id).not.toBe('track_2');
  });

  it('startNewSession resets playback and starts a fresh random track', () => {
    player.setPlaylist(mockTracks);

    player.play(0);
    expect(player.getCurrentTrack()?.id).toBe('track_1');

    player.startNewSession();
    expect(player.getIsPlaying()).toBe(true);
    expect(player.getCurrentTrack()).not.toBeNull();
  });
});
