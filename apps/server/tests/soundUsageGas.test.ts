import { describe, it, expect } from 'vitest';
import { buildSoundUsageIndex, usageForSound } from '../src/services/soundUsage.service';

const db = (gases: any[]) =>
  ({
    mob: { findMany: async () => [] },
    item: { findMany: async () => [] },
    miningBlock: { findMany: async () => [] },
    gas: { findMany: async () => gases },
  }) as any;

describe('sound usage for gas sounds', () => {
  it('lists each gas slot that uses a library sound', async () => {
    const index = await buildSoundUsageIndex(
      db([
        { name: 'Hydrogen', soundEffects: { enter: { soundId: 's1' }, explode: { soundId: 's1' } } },
        { name: 'Nitrogen', soundEffects: { enter: { soundId: 's2' } } },
      ])
    );
    expect(usageForSound(index, { id: 's1', url: '/x.mp3' })).toEqual(['Gas: Hydrogen (enter)', 'Gas: Hydrogen (explode)']);
    expect(usageForSound(index, { id: 's2', url: '/y.mp3' })).toEqual(['Gas: Nitrogen (enter)']);
  });

  it('is empty when no gas sounds are set, or gases are not available', async () => {
    expect(usageForSound(await buildSoundUsageIndex(db([{ name: 'Hydrogen', soundEffects: null }])), { id: 's1', url: '/x.mp3' })).toEqual([]);
    const withoutGases = { mob: { findMany: async () => [] }, item: { findMany: async () => [] }, miningBlock: { findMany: async () => [] } } as any;
    expect(usageForSound(await buildSoundUsageIndex(withoutGases), { id: 's1', url: '/x.mp3' })).toEqual([]);
  });
});
