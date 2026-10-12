import { describe, it, expect } from 'vitest';
import { weaponSoundOf, throwSoundOf } from './weaponSound';

describe('weaponSoundOf', () => {
  it('uses the shoot slot and the volume set on it', () => {
    expect(weaponSoundOf({ soundEffects: { shoot: { url: '/shot.mp3', volume: 0.3 } } })).toEqual({ url: '/shot.mp3', volume: 0.3 });
  });

  it('plays at full volume when none is set', () => {
    expect(weaponSoundOf({ soundEffects: { shoot: { url: '/shot.mp3' } } })?.volume).toBe(1);
  });

  it('falls back to the legacy single sound, whose volume is kept on the throw slot', () => {
    expect(weaponSoundOf({ soundEffectUrl: '/legacy.mp3', soundEffects: { throw: { url: '/legacy.mp3', volume: 0.5 } } })).toEqual({
      url: '/legacy.mp3', volume: 0.5,
    });
    expect(weaponSoundOf({ soundEffectUrl: '/legacy.mp3' })).toEqual({ url: '/legacy.mp3', volume: 1 });
  });

  it('prefers the shoot slot over the legacy sound, with the shoot slot\'s own volume', () => {
    const sound = weaponSoundOf({
      soundEffectUrl: '/legacy.mp3',
      soundEffects: { shoot: { url: '/shot.mp3', volume: 0.2 }, throw: { url: '/legacy.mp3', volume: 0.9 } },
    });
    expect(sound).toEqual({ url: '/shot.mp3', volume: 0.2 });
  });

  it('is null for a weapon without a sound, or no weapon', () => {
    expect(weaponSoundOf({})).toBeNull();
    expect(weaponSoundOf(null)).toBeNull();
    expect(weaponSoundOf(undefined)).toBeNull();
  });

  it('keeps an unusable stored volume from silencing or blasting the sound', () => {
    expect(weaponSoundOf({ soundEffects: { shoot: { url: '/s.mp3', volume: 'loud' as any } } })?.volume).toBe(1);
    expect(weaponSoundOf({ soundEffects: { shoot: { url: '/s.mp3', volume: 9 } } })?.volume).toBe(1);
  });
});

describe('throwSoundOf', () => {
  it('uses the throw slot and its volume', () => {
    expect(throwSoundOf({ soundEffects: { throw: { url: '/t.mp3', volume: 0.4 } } })).toEqual({ url: '/t.mp3', volume: 0.4 });
  });

  it('falls back to the legacy sound, then to the default dynamite throw sound', () => {
    expect(throwSoundOf({ soundEffectUrl: '/legacy.mp3' })).toEqual({ url: '/legacy.mp3', volume: 1 });
    const fallback = throwSoundOf({});
    expect(fallback?.url).toBeTruthy();
    expect(fallback?.volume).toBe(1);
  });
});
