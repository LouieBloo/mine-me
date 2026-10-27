import { describe, it, expect } from 'vitest';
import { DOODAD_SOUND_SLOT_KEYS, getDoodadSoundSlot, isDoodadSoundSlot, normalizeDoodadSoundRefs, resolveDoodadSounds } from '../DoodadSoundProfile';

const library = new Map([
  ['s1', { url: '/assets/sounds/drip.mp3', isActive: true }],
  ['off', { url: '/assets/sounds/off.mp3', isActive: false }],
]);

describe('doodad sound slots', () => {
  it('has ambient, react, break, hit and death, and only ambient can loop', () => {
    expect(DOODAD_SOUND_SLOT_KEYS).toEqual(['ambient', 'react', 'break', 'hit', 'death']);
    expect(getDoodadSoundSlot('ambient')?.loopToggleable).toBe(true);
    expect(getDoodadSoundSlot('react')?.loopToggleable).toBe(false);
    expect(isDoodadSoundSlot('break')).toBe(true);
    expect(isDoodadSoundSlot('enter')).toBe(false);
  });

  it('drops unknown slots when cleaning stored references', () => {
    expect(normalizeDoodadSoundRefs({ ambient: { soundId: 's1', volume: 0.5 }, bogus: { soundId: 's1' } })).toEqual({ ambient: { soundId: 's1', volume: 0.5 } });
  });

  it('resolves a slot to its url with its own volume, and leaves a missing or inactive sound silent', () => {
    const out = resolveDoodadSounds({ ambient: { soundId: 's1', volume: 0.4 }, react: { soundId: 'off' }, break: { soundId: 'gone' } }, library);
    expect(out.ambient).toMatchObject({ url: '/assets/sounds/drip.mp3', volume: 0.4 });
    expect(out.react).toBeUndefined();
    expect(out.break).toBeUndefined();
  });
});
