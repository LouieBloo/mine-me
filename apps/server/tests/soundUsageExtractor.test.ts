import { describe, it, expect } from 'vitest';
import { buildSoundUsageIndex, usageForSound } from '../src/services/soundUsage.service';

const db = (extractors?: any[]) =>
  ({
    mob: { findMany: async () => [] },
    item: { findMany: async () => [] },
    miningBlock: { findMany: async () => [] },
    ...(extractors ? { extractor: { findMany: async () => extractors } } : {}),
  }) as any;

describe('sound usage for extractor sounds', () => {
  it('lists each extractor slot that uses a library sound', async () => {
    const index = await buildSoundUsageIndex(db([{ name: 'Basic', soundEffects: { landing: { soundId: 's1' }, loop: { soundId: 's1' } } }]));
    expect(usageForSound(index, { id: 's1', url: '/x.mp3' })).toEqual(['Extractor: Basic (landing)', 'Extractor: Basic (loop)']);
  });

  it('is empty when no sounds are set, or extractors are not available', async () => {
    expect(usageForSound(await buildSoundUsageIndex(db([{ name: 'Basic', soundEffects: null }])), { id: 's1', url: '/x.mp3' })).toEqual([]);
    expect(usageForSound(await buildSoundUsageIndex(db()), { id: 's1', url: '/x.mp3' })).toEqual([]);
  });
});
