import { describe, it, expect } from 'vitest';
import { MISSION_SOUND_SLOT_KEYS, getMissionSoundSlot, isMissionSoundSlot, normalizeMissionSoundRefs, resolveMissionSounds } from '../MissionSoundProfile';

const library = new Map([
  ['s1', { url: '/assets/sounds/chime.mp3', isActive: true }],
  ['off', { url: '/assets/sounds/off.mp3', isActive: false }],
]);

describe('mission sound slots', () => {
  it('has objective, complete and failed, none of which loop', () => {
    expect(MISSION_SOUND_SLOT_KEYS).toEqual(['objective', 'complete', 'failed']);
    expect(getMissionSoundSlot('complete')?.loopToggleable).toBeFalsy();
    expect(isMissionSoundSlot('failed')).toBe(true);
    expect(isMissionSoundSlot('ambient')).toBe(false);
  });

  it('drops unknown slots when cleaning stored references', () => {
    expect(normalizeMissionSoundRefs({ complete: { soundId: 's1', volume: 0.5 }, bogus: { soundId: 's1' } })).toEqual({ complete: { soundId: 's1', volume: 0.5 } });
  });

  it('resolves a slot to its url with its own volume, and leaves a missing or inactive sound silent', () => {
    const out = resolveMissionSounds({ objective: { soundId: 's1', volume: 0.4 }, complete: { soundId: 'off' }, failed: { soundId: 'gone' } }, library);
    expect(out.objective).toMatchObject({ url: '/assets/sounds/chime.mp3', volume: 0.4 });
    expect(out.complete).toBeUndefined();
    expect(out.failed).toBeUndefined();
  });
});
