import { describe, it, expect } from 'vitest';
import { SURFACE_SOUND_SLOT_KEYS, getSurfaceSoundSlot, isSurfaceSoundSlot, normalizeSurfaceSoundRefs, resolveSurfaceSounds } from '../SurfaceSoundProfile';

const library = new Map([
  ['s1', { url: '/assets/sounds/rain.mp3', isActive: true }],
  ['off', { url: '/assets/sounds/off.mp3', isActive: false }],
]);

describe('surface sound slots', () => {
  it('has rain and wind loops and a one-shot thunder', () => {
    expect(SURFACE_SOUND_SLOT_KEYS).toEqual(['rain', 'wind', 'thunder']);
    expect(getSurfaceSoundSlot('rain')?.defaultLoop).toBe(true);
    expect(getSurfaceSoundSlot('wind')?.defaultLoop).toBe(true);
    expect(getSurfaceSoundSlot('thunder')?.defaultLoop).toBe(false);
    expect(isSurfaceSoundSlot('thunder')).toBe(true);
    expect(isSurfaceSoundSlot('ambient')).toBe(false);
  });

  it('drops unknown slots when cleaning stored references', () => {
    expect(normalizeSurfaceSoundRefs({ rain: { soundId: 's1', volume: 0.5 }, bogus: { soundId: 's1' } })).toEqual({ rain: { soundId: 's1', volume: 0.5 } });
  });

  it('resolves a slot to its url with its own volume, and leaves a missing or inactive sound silent', () => {
    const out = resolveSurfaceSounds({ rain: { soundId: 's1', volume: 0.4 }, wind: { soundId: 'off' }, thunder: { soundId: 'gone' } }, library);
    expect(out.rain).toMatchObject({ url: '/assets/sounds/rain.mp3', volume: 0.4 });
    expect(out.wind).toBeUndefined();
    expect(out.thunder).toBeUndefined();
  });
});
