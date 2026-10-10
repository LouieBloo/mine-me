import { describe, it, expect } from 'vitest';
import { planMobSoundLinks } from '../prisma/migrate-sound-library';

const library = [
  { id: 's_dig', url: '/assets/sounds/dig.mp3' },
  { id: 's_idle', url: '/assets/sounds/idle.mp3' },
];

describe('planMobSoundLinks', () => {
  it('links seed urls to library sounds by id', () => {
    const plan = planMobSoundLinks(
      [{ id: 'm1', name: 'Mole', soundEffects: null }],
      { m1: { dig: { url: '/assets/sounds/dig.mp3' }, idle: { url: '/assets/sounds/idle.mp3' } } },
      library
    );
    expect(plan).toEqual([{ mobId: 'm1', mobName: 'Mole', soundEffects: { dig: { soundId: 's_dig' }, idle: { soundId: 's_idle' } } }]);
  });

  it('skips unknown slots, urls with no library row and empty entries', () => {
    const plan = planMobSoundLinks(
      [{ id: 'm1', name: 'Mole' }],
      { m1: { fly: { url: '/assets/sounds/dig.mp3' }, damage: { url: '/assets/sounds/none.mp3' }, death: { url: null } } },
      library
    );
    expect(plan).toEqual([]);
  });

  it('never overwrites a mob that already has references (idempotent, keeps admin edits)', () => {
    const plan = planMobSoundLinks(
      [{ id: 'm1', name: 'Mole', soundEffects: { attack: { soundId: 'x' } } }],
      { m1: { dig: { url: '/assets/sounds/dig.mp3' } } },
      library
    );
    expect(plan).toEqual([]);
  });

  it('ignores mobs with no seed sounds', () => {
    expect(planMobSoundLinks([{ id: 'm2', name: 'Dawg' }], {}, library)).toEqual([]);
  });
});
