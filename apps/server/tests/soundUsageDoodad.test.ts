import { describe, it, expect } from 'vitest';
import { buildSoundUsageIndex, usageForSound } from '../src/services/soundUsage.service';

const db = (doodads?: any[]) =>
  ({
    mob: { findMany: async () => [] },
    item: { findMany: async () => [] },
    miningBlock: { findMany: async () => [] },
    ...(doodads ? { doodad: { findMany: async () => doodads } } : {}),
  }) as any;

describe('sound usage for doodad sounds', () => {
  it('lists each doodad slot that uses a library sound', async () => {
    const index = await buildSoundUsageIndex(db([
      { name: 'Drip', soundEffects: { ambient: { soundId: 's1' }, break: { soundId: 's1' } } },
      { name: 'Grass', soundEffects: { react: { soundId: 's2' } } },
    ]));
    expect(usageForSound(index, { id: 's1', url: '/x.mp3' })).toEqual(['Doodad: Drip (ambient)', 'Doodad: Drip (break)']);
    expect(usageForSound(index, { id: 's2', url: '/y.mp3' })).toEqual(['Doodad: Grass (react)']);
  });

  it('is empty when no doodad sounds are set, or doodads are not available', async () => {
    expect(usageForSound(await buildSoundUsageIndex(db([{ name: 'Drip', soundEffects: null }])), { id: 's1', url: '/x.mp3' })).toEqual([]);
    expect(usageForSound(await buildSoundUsageIndex(db()), { id: 's1', url: '/x.mp3' })).toEqual([]);
  });
});
