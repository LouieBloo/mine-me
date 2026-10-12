import { describe, it, expect } from 'vitest';
import { buildSoundUsageIndex, usageForSound } from '../src/services/soundUsage.service';

const db = (character: any) =>
  ({
    mob: { findMany: async () => [] },
    item: { findMany: async () => [] },
    miningBlock: { findMany: async () => [] },
    characterSoundConfig: { findUnique: async () => character },
  }) as any;

describe('sound usage for character sounds', () => {
  it('lists the character slot that uses a library sound', async () => {
    const index = await buildSoundUsageIndex(db({ id: 'default', soundEffects: { hurt: { soundId: 's1' }, jump: { soundId: 's1' } } }));
    expect(usageForSound(index, { id: 's1', url: '/x.mp3' })).toEqual(['Character (hurt)', 'Character (jump)']);
  });

  it('is empty when no character sounds are set', async () => {
    const index = await buildSoundUsageIndex(db(null));
    expect(usageForSound(index, { id: 's1', url: '/x.mp3' })).toEqual([]);
  });
});
