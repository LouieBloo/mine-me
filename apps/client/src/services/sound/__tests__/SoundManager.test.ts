import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SoundManager } from '../SoundManager';

describe('SoundManager', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns singleton instance', () => {
    const instance1 = SoundManager.getInstance();
    const instance2 = SoundManager.getInstance();
    expect(instance1).toBe(instance2);
  });

  it('provides default sound settings: 70% BGM and 90% SFX', () => {
    const manager = SoundManager.getInstance();
    const settings = manager.getSettings();

    expect(settings.bgmVolume).toBe(0.7);
    expect(settings.sfxVolume).toBe(0.9);
    expect(settings.bgmEnabled).toBe(true);
    expect(settings.sfxEnabled).toBe(true);
  });

  it('updates BGM volume and notifies subscribers', () => {
    const manager = SoundManager.getInstance();
    const listener = vi.fn();
    const unsubscribe = manager.subscribe(listener);

    manager.setBgmVolume(0.5);

    expect(manager.getSettings().bgmVolume).toBe(0.5);
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ bgmVolume: 0.5 }));

    unsubscribe();
  });

  it('updates SFX volume and notifies subscribers', () => {
    const manager = SoundManager.getInstance();
    const listener = vi.fn();
    const unsubscribe = manager.subscribe(listener);

    manager.setSfxVolume(0.35);

    expect(manager.getSettings().sfxVolume).toBe(0.35);
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ sfxVolume: 0.35 }));

    unsubscribe();
  });

  it('toggles channels', () => {
    const manager = SoundManager.getInstance();

    const bgmState = manager.toggleBgm();
    expect(bgmState).toBe(false);
    expect(manager.getSettings().bgmEnabled).toBe(false);

    manager.toggleBgm();
    expect(manager.getSettings().bgmEnabled).toBe(true);

    const sfxState = manager.toggleSfx();
    expect(sfxState).toBe(false);
    expect(manager.getSettings().sfxEnabled).toBe(false);

    manager.toggleSfx();
    expect(manager.getSettings().sfxEnabled).toBe(true);
  });

  it('throttles duplicate playSfx calls for the same sound effect URL', () => {
    const manager = SoundManager.getInstance();
    manager.playSfx('/assets/sounds/test.mp3');
    const second = manager.playSfx('/assets/sounds/test.mp3');

    // First call plays, second within throttle window is suppressed
    expect(second).toBeNull();
  });

  it('plays and stops looping SFX by key', () => {
    const manager = SoundManager.getInstance();
    const key = 'test_loop_1';

    const howl1 = manager.playLoopingSfx(key, '/assets/sounds/fuse.mp3');
    expect(howl1).toBeDefined();
    expect(manager.isLoopingSfxPlaying(key)).toBe(true);

    // Calling again returns existing playing howl
    const howl2 = manager.playLoopingSfx(key, '/assets/sounds/fuse.mp3');
    expect(howl2).toBe(howl1);

    manager.stopLoopingSfx(key);
    expect(manager.isLoopingSfxPlaying(key)).toBe(false);
  });

  it('stops all looping SFX', () => {
    const manager = SoundManager.getInstance();
    manager.playLoopingSfx('loop_a', '/assets/sounds/a.mp3');
    manager.playLoopingSfx('loop_b', '/assets/sounds/b.mp3');

    expect(manager.isLoopingSfxPlaying('loop_a')).toBe(true);
    expect(manager.isLoopingSfxPlaying('loop_b')).toBe(true);

    manager.stopAllLoopingSfx();

    expect(manager.isLoopingSfxPlaying('loop_a')).toBe(false);
    expect(manager.isLoopingSfxPlaying('loop_b')).toBe(false);
  });
});
