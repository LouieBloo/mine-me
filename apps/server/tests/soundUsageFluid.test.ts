import { describe, it, expect } from 'vitest';
import { buildSoundUsageIndex, usageForSound } from '../src/services/soundUsage.service';

const db = (fluids: any[]) =>
  ({
    mob: { findMany: async () => [] },
    item: { findMany: async () => [] },
    miningBlock: { findMany: async () => [] },
    fluid: { findMany: async () => fluids },
  }) as any;

describe('sound usage for fluid sounds', () => {
  it('lists each fluid slot that uses a library sound', async () => {
    const index = await buildSoundUsageIndex(
      db([
        { name: 'Oil', soundEffects: { enter: { soundId: 's1' }, burn: { soundId: 's1' } } },
        { name: 'Water', soundEffects: { enter: { soundId: 's2' } } },
      ])
    );
    expect(usageForSound(index, { id: 's1', url: '/x.mp3' })).toEqual(['Fluid: Oil (enter)', 'Fluid: Oil (burn)']);
    expect(usageForSound(index, { id: 's2', url: '/y.mp3' })).toEqual(['Fluid: Water (enter)']);
  });

  it('is empty when no fluid sounds are set, or fluids are not available', async () => {
    expect(usageForSound(await buildSoundUsageIndex(db([{ name: 'Oil', soundEffects: null }])), { id: 's1', url: '/x.mp3' })).toEqual([]);
    const withoutFluids = { mob: { findMany: async () => [] }, item: { findMany: async () => [] }, miningBlock: { findMany: async () => [] } } as any;
    expect(usageForSound(await buildSoundUsageIndex(withoutFluids), { id: 's1', url: '/x.mp3' })).toEqual([]);
  });
});
