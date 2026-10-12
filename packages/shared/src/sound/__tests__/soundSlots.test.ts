import { describe, it, expect } from 'vitest';
import { clampSoundVolume, DEFAULT_SOUND_VOLUME } from '../soundSlots';

describe('clampSoundVolume', () => {
  it('keeps a volume from 0 to 1 as it is', () => {
    expect(clampSoundVolume(0)).toBe(0);
    expect(clampSoundVolume(0.35)).toBe(0.35);
    expect(clampSoundVolume(1)).toBe(1);
  });

  it('clamps out-of-range numbers into 0 to 1', () => {
    expect(clampSoundVolume(2)).toBe(1);
    expect(clampSoundVolume(-0.5)).toBe(0);
  });

  it('falls back to the default (full volume) for anything that is not a usable number', () => {
    expect(DEFAULT_SOUND_VOLUME).toBe(1);
    for (const bad of [undefined, null, NaN, Infinity, -Infinity, '0.5', {}, []]) {
      expect(clampSoundVolume(bad)).toBe(1);
    }
  });
});
