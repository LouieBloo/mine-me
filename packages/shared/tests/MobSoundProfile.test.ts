import { describe, it, expect } from 'vitest';
import {
  MOB_SOUND_SLOTS,
  MOB_SOUND_SLOT_KEYS,
  getMobSoundSlot,
  isMobSoundSlot,
  normalizeMobSoundRefs,
  resolveMobSounds,
} from '../src/sound/MobSoundProfile';
import { MINING_SPATIAL_AUDIO_PRESETS } from '../src/types/sound';

const library = new Map([
  ['s_hit', { url: '/assets/sounds/hit.mp3', volume: 0.5, isActive: true }],
  ['s_off', { url: '/assets/sounds/off.mp3', volume: 1, isActive: false }],
]);

describe('mob sound slots', () => {
  it('defines dig, idle, damage, attack and death', () => {
    expect(MOB_SOUND_SLOT_KEYS).toEqual(['dig', 'idle', 'damage', 'attack', 'death']);
    expect(MOB_SOUND_SLOTS.every((s) => s.label && s.description)).toBe(true);
    expect(getMobSoundSlot('death')?.label).toBe('Death');
    expect(getMobSoundSlot('nope')).toBeUndefined();
    expect(isMobSoundSlot('attack')).toBe(true);
    expect(isMobSoundSlot('fly')).toBe(false);
  });

  it('has spatial presets for attack and death', () => {
    expect(MINING_SPATIAL_AUDIO_PRESETS.MOB_ATTACK.maxDistance).toBeGreaterThan(0);
    expect(MINING_SPATIAL_AUDIO_PRESETS.MOB_DEATH.maxDistance).toBeGreaterThan(0);
  });
});

describe('normalizeMobSoundRefs', () => {
  it('keeps known slots with a sound id and drops everything else', () => {
    expect(
      normalizeMobSoundRefs({
        dig: { soundId: 's_hit', url: '/ignored.mp3' },
        idle: { soundId: '' },
        damage: {},
        fly: { soundId: 's_hit' },
        death: 'x',
      })
    ).toEqual({ dig: { soundId: 's_hit' } });
  });

  it('returns an empty object for junk input', () => {
    expect(normalizeMobSoundRefs(null)).toEqual({});
    expect(normalizeMobSoundRefs('x')).toEqual({});
  });
});

describe('resolveMobSounds', () => {
  it('resolves ids to urls and volumes from the library', () => {
    const out = resolveMobSounds({ attack: { soundId: 's_hit' } }, library);
    expect(out.attack).toEqual({ soundId: 's_hit', url: '/assets/sounds/hit.mp3', volume: 0.5, loop: false });
  });

  it('leaves out slots whose sound is missing or inactive', () => {
    const out = resolveMobSounds({ dig: { soundId: 'gone' }, idle: { soundId: 's_off' } }, library);
    expect(out).toEqual({});
  });

  it('is empty when the mob has no sound config', () => {
    expect(resolveMobSounds(undefined, library)).toEqual({});
  });
});
