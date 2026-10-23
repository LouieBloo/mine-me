import { describe, it, expect } from 'vitest';
import {
  CHARACTER_SOUND_SLOTS,
  CHARACTER_SOUND_SLOT_KEYS,
  getCharacterSoundSlot,
  isCharacterSoundSlot,
  normalizeCharacterSoundRefs,
  resolveCharacterSounds,
} from '../CharacterSoundProfile';
import { MOB_SOUND_SLOTS, normalizeMobSoundRefs, resolveMobSounds } from '../MobSoundProfile';

const library = new Map([
  ['s1', { url: '/assets/sounds/hurt.mp3', volume: 0.8, isActive: true }],
  ['s2', { url: '/assets/sounds/jump.mp3', volume: 1, isActive: true }],
  ['off', { url: '/assets/sounds/off.mp3', volume: 1, isActive: false }],
]);

describe('character sound slots', () => {
  it('offers hurt, jump, land, pickup, backpack full and death', () => {
    expect(CHARACTER_SOUND_SLOT_KEYS).toEqual(['hurt', 'jump', 'land', 'pickup', 'backpackFull', 'death']);
    for (const slot of CHARACTER_SOUND_SLOTS) {
      expect(slot.label).toBeTruthy();
      expect(slot.description).toBeTruthy();
    }
  });

  it('recognises only real slots', () => {
    expect(isCharacterSoundSlot('land')).toBe(true);
    expect(isCharacterSoundSlot('dig')).toBe(false);
    expect(isCharacterSoundSlot(undefined)).toBe(false);
    expect(getCharacterSoundSlot('jump')?.slotKey).toBe('jump');
    expect(getCharacterSoundSlot('nope')).toBeUndefined();
  });
});

describe('normalizeCharacterSoundRefs', () => {
  it('keeps only known slots that point at a sound id', () => {
    expect(
      normalizeCharacterSoundRefs({
        hurt: { soundId: 's1', extra: 1 },
        jump: { soundId: '' },
        land: { soundId: 5 },
        death: 'x',
        dig: { soundId: 's2' },
      })
    ).toEqual({ hurt: { soundId: 's1' } });
  });

  it('ignores loop on slots that cannot loop, and junk input', () => {
    expect(normalizeCharacterSoundRefs({ hurt: { soundId: 's1', loop: true } })).toEqual({ hurt: { soundId: 's1' } });
    for (const junk of [null, undefined, 3, 'a', []]) expect(normalizeCharacterSoundRefs(junk)).toEqual({});
  });
});

describe('resolveCharacterSounds', () => {
  it('turns references into playable urls from the library', () => {
    const out = resolveCharacterSounds({ hurt: { soundId: 's1' }, jump: { soundId: 's2' } }, library);
    expect(out.hurt).toEqual({ soundId: 's1', url: '/assets/sounds/hurt.mp3', volume: 1, loop: false });
    expect(out.jump?.url).toBe('/assets/sounds/jump.mp3');
    expect(out.land).toBeUndefined();
  });

  it('uses the volume set on the character slot, not the library sound\'s', () => {
    const out = resolveCharacterSounds({ jump: { soundId: 's2', volume: 0.3 }, hurt: { soundId: 's1' } }, library);
    expect(out.jump?.volume).toBe(0.3);
    expect(out.hurt?.volume).toBe(1);
  });

  it('leaves out slots whose sound is missing or inactive', () => {
    const out = resolveCharacterSounds({ hurt: { soundId: 'gone' }, death: { soundId: 'off' } }, library);
    expect(out).toEqual({});
  });
});

describe('mob sounds still behave the same on the shared slot helpers', () => {
  it('normalizes and resolves mob slots', () => {
    expect(MOB_SOUND_SLOTS.length).toBe(5);
    const toggleable = MOB_SOUND_SLOTS.filter(s => s.loopToggleable).map(s => s.slotKey);
    const refs = normalizeMobSoundRefs({ dig: { soundId: 's1', loop: true }, idle: { soundId: 's2' }, hurt: { soundId: 's1' } });
    expect(Object.keys(refs).sort()).toEqual(['dig', 'idle']);
    expect(refs.dig?.loop).toBe(toggleable.includes('dig') ? true : undefined);
    expect(resolveMobSounds({ death: { soundId: 's1' } }, library).death?.url).toBe('/assets/sounds/hurt.mp3');
  });
});
