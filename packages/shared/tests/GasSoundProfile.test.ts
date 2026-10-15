import { describe, it, expect } from 'vitest';
import {
  GAS_SOUND_SLOTS, GAS_SOUND_SLOT_KEYS, getGasSoundSlot, isGasSoundSlot, normalizeGasSoundRefs, resolveGasSounds, SOUND_CATEGORIES,
} from '../src/index';

const library = new Map([
  ['s1', { url: '/assets/sounds/boom.mp3', isActive: true }],
  ['s2', { url: '/assets/sounds/off.mp3', isActive: false }],
]);

describe('gas sound slots', () => {
  it('has the five slots, defined once, none looping by default', () => {
    expect(GAS_SOUND_SLOT_KEYS).toEqual(['enter', 'exit', 'ignite', 'explode', 'vent']);
    expect(GAS_SOUND_SLOTS.every((s) => s.label && s.description && s.icon && !s.defaultLoop)).toBe(true);
    expect(getGasSoundSlot('explode')?.label).toBe('Explode');
  });

  it('recognises slot names and nothing else', () => {
    expect(isGasSoundSlot('vent')).toBe(true);
    expect(isGasSoundSlot('burn')).toBe(false);
    expect(isGasSoundSlot(undefined)).toBe(false);
    expect(getGasSoundSlot('dig')).toBeUndefined();
  });

  it('has gases as a sound category so their sounds have a home in the library', () => {
    expect(SOUND_CATEGORIES).toContain('GAS');
  });

  it('cleans stored references: unknown slots and junk are dropped, volume stays within 0 and 1', () => {
    expect(
      normalizeGasSoundRefs({ enter: { soundId: 's1', volume: 0.4, extra: 1 }, exit: { soundId: '' }, ignite: { soundId: 's1', volume: 5 }, burn: { soundId: 's1' }, vent: 'nope' })
    ).toEqual({ enter: { soundId: 's1', volume: 0.4 }, ignite: { soundId: 's1', volume: 1 } });
    expect(normalizeGasSoundRefs(null)).toEqual({});
  });

  it('resolves to playable sounds with the volume set on this gas, not the library\'s; gone or inactive sounds stay silent', () => {
    expect(resolveGasSounds({ explode: { soundId: 's1', volume: 0.3 } }, library).explode).toEqual({ soundId: 's1', url: '/assets/sounds/boom.mp3', volume: 0.3, loop: false });
    expect(resolveGasSounds({ enter: { soundId: 's2' }, exit: { soundId: 'missing' } }, library)).toEqual({});
  });
});
