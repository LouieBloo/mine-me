import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SoundChannel } from '../SoundChannel';

describe('SoundChannel', () => {
  let channel: SoundChannel;

  beforeEach(() => {
    channel = new SoundChannel('bgm', 0.7, true);
  });

  it('initializes with specified volume and enabled state', () => {
    expect(channel.name).toBe('bgm');
    expect(channel.getVolume()).toBe(0.7);
    expect(channel.isEnabled()).toBe(true);
    expect(channel.getEffectiveVolume()).toBe(0.7);
  });

  it('clamps volume between 0 and 1', () => {
    channel.setVolume(1.5);
    expect(channel.getVolume()).toBe(1.0);

    channel.setVolume(-0.5);
    expect(channel.getVolume()).toBe(0.0);

    channel.setVolume(0.45);
    expect(channel.getVolume()).toBe(0.45);
  });

  it('effective volume is 0 when disabled', () => {
    channel.setVolume(0.8);
    expect(channel.getEffectiveVolume()).toBe(0.8);

    channel.setEnabled(false);
    expect(channel.isEnabled()).toBe(false);
    expect(channel.getEffectiveVolume()).toBe(0.0);

    channel.setEnabled(true);
    expect(channel.getEffectiveVolume()).toBe(0.8);
  });

  it('toggles enabled state', () => {
    expect(channel.isEnabled()).toBe(true);
    const newState = channel.toggle();
    expect(newState).toBe(false);
    expect(channel.isEnabled()).toBe(false);

    const reverted = channel.toggle();
    expect(reverted).toBe(true);
    expect(channel.isEnabled()).toBe(true);
  });

  it('applies volume to registered howls', () => {
    const mockHowl: any = {
      volume: vi.fn(),
      loop: vi.fn().mockReturnValue(false),
      on: vi.fn(),
      stop: vi.fn(),
    };

    channel.register(mockHowl);
    expect(mockHowl.volume).toHaveBeenCalledWith(0.7);

    channel.setVolume(0.5);
    expect(mockHowl.volume).toHaveBeenCalledWith(0.5);

    channel.setEnabled(false);
    expect(mockHowl.volume).toHaveBeenCalledWith(0);
  });

  describe('per-use volume stays relative to the channel volume', () => {
    const fakeHowl = () => ({ volume: vi.fn(), on: vi.fn(), loop: vi.fn() }) as any;

    it('plays each sound at the channel volume times its own scale', () => {
      const sfx = new SoundChannel('sfx', 0.8, true);
      const quiet = fakeHowl();
      const full = fakeHowl();
      sfx.register(quiet, 0.5);
      sfx.register(full, 1);
      expect(quiet.volume).toHaveBeenLastCalledWith(0.4);
      expect(full.volume).toHaveBeenLastCalledWith(0.8);
    });

    it('moving the slider rescales every playing sound, keeping their proportions', () => {
      const sfx = new SoundChannel('sfx', 0.8, true);
      const quiet = fakeHowl();
      const full = fakeHowl();
      sfx.register(quiet, 0.5);
      sfx.register(full, 1);

      sfx.setVolume(0.4);
      expect(quiet.volume).toHaveBeenLastCalledWith(0.2);
      expect(full.volume).toHaveBeenLastCalledWith(0.4);

      sfx.setEnabled(false);
      expect(quiet.volume).toHaveBeenLastCalledWith(0);
      expect(full.volume).toHaveBeenLastCalledWith(0);
    });
  });
});
