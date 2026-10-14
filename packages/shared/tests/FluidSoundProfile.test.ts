import { describe, it, expect } from 'vitest';
import {
  FLUID_SOUND_SLOTS,
  FLUID_SOUND_SLOT_KEYS,
  getFluidSoundSlot,
  isFluidSoundSlot,
  normalizeFluidSoundRefs,
  resolveFluidSounds,
  SOUND_CATEGORIES,
} from '../src/index';

const library = new Map([
  ['s1', { url: '/assets/sounds/splash.mp3', isActive: true }],
  ['s2', { url: '/assets/sounds/off.mp3', isActive: false }],
]);

describe('fluid sound slots', () => {
  it('has the four slots, defined once, with the burn slot looping by default', () => {
    expect(FLUID_SOUND_SLOT_KEYS).toEqual(['enter', 'exit', 'ignite', 'burn']);
    expect(getFluidSoundSlot('burn')?.defaultLoop).toBe(true);
    expect(getFluidSoundSlot('enter')?.defaultLoop).toBe(false);
    expect(FLUID_SOUND_SLOTS.every((s) => s.label && s.description && s.icon)).toBe(true);
  });

  it('recognises slot names and nothing else', () => {
    expect(isFluidSoundSlot('exit')).toBe(true);
    expect(isFluidSoundSlot('dig')).toBe(false);
    expect(isFluidSoundSlot(undefined)).toBe(false);
    expect(getFluidSoundSlot('dig')).toBeUndefined();
  });

  it('keeps fluids as a sound category so their sounds have a home in the library', () => {
    expect(SOUND_CATEGORIES).toContain('FLUID');
  });

  it('cleans stored references: unknown slots and junk are dropped, volume is kept within 0 and 1', () => {
    expect(
      normalizeFluidSoundRefs({
        enter: { soundId: 's1', volume: 0.4, extra: 1 },
        exit: { soundId: '' },
        ignite: { soundId: 's1', volume: 5 },
        dig: { soundId: 's1' },
        burn: 'nope',
      })
    ).toEqual({ enter: { soundId: 's1', volume: 0.4 }, ignite: { soundId: 's1', volume: 1 } });
    expect(normalizeFluidSoundRefs(null)).toEqual({});
  });

  it('resolves references to playable sounds with the volume set on this fluid, not the library\'s', () => {
    const sounds = resolveFluidSounds({ enter: { soundId: 's1', volume: 0.3 }, burn: { soundId: 's1' } }, library);
    expect(sounds.enter).toEqual({ soundId: 's1', url: '/assets/sounds/splash.mp3', volume: 0.3, loop: false });
    expect(sounds.burn).toEqual({ soundId: 's1', url: '/assets/sounds/splash.mp3', volume: 1, loop: true });
  });

  it('leaves out a slot whose sound is gone or switched off', () => {
    expect(resolveFluidSounds({ enter: { soundId: 's2' }, exit: { soundId: 'missing' } }, library)).toEqual({});
  });
});
