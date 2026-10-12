import { describe, it, expect } from 'vitest';
import { withVolume } from './sfxVolume';

describe('withVolume', () => {
  it('turns the volume set where a sound is used into the sound manager\'s volume scale', () => {
    expect(withVolume(0.4)).toEqual({ volumeScale: 0.4 });
  });

  it('plays at full volume when none is set or the value is unusable', () => {
    for (const v of [undefined, null, NaN, 'x' as any]) expect(withVolume(v).volumeScale).toBe(1);
  });

  it('clamps into 0 to 1, and 0 is silent', () => {
    expect(withVolume(0).volumeScale).toBe(0);
    expect(withVolume(5).volumeScale).toBe(1);
    expect(withVolume(-1).volumeScale).toBe(0);
  });

  it('keeps the other options (position, spatial, throttle)', () => {
    const out = withVolume(0.5, { position: { x: 1, y: 2 }, throttleMs: 50 });
    expect(out).toEqual({ position: { x: 1, y: 2 }, throttleMs: 50, volumeScale: 0.5 });
  });

  it('multiplies with a volume scale already in the options instead of replacing it', () => {
    expect(withVolume(0.5, { volumeScale: 0.5 }).volumeScale).toBe(0.25);
  });
});
