import { describe, it, expect } from 'vitest';
import { MiningTileType } from '@mine-me/shared';
import { RETIRED_BLOCK_KEYS, stripRetiredFromPalette } from './remove-retired-blocks';
import { tileTypeForBlockKey } from '../src/services/mining/subsystems/MiningDataManager';

describe('remove-retired-blocks', () => {
  it('none of the retired keys is a block the game still knows', () => {
    for (const key of RETIRED_BLOCK_KEYS) expect(tileTypeForBlockKey(key)).toBeUndefined();
  });

  it('chest, mineral and entrance are gone from the tile types, bridge stays as an item-placed tile', () => {
    expect('CHEST' in MiningTileType).toBe(false);
    expect('MINERAL' in MiningTileType).toBe(false);
    expect('ENTRANCE' in MiningTileType).toBe(false);
    expect(MiningTileType.BRIDGE).toBe(10);
  });

  it('takes retired weights and swaps out of a palette and keeps the rest', () => {
    const next = stripRetiredFromPalette({
      weights: { COPPERIUM: 2, CHEST: 3, MINERAL: 0.5 },
      swaps: [{ from: 'DIRT', to: 'STONE' }, { from: 'DIRT', to: 'MINERAL' }, { from: 'CHEST', to: 'DIRT' }],
    });
    expect(next).toEqual({ weights: { COPPERIUM: 2 }, swaps: [{ from: 'DIRT', to: 'STONE' }] });
  });

  it('returns null when the palette has nothing retired (or no palette)', () => {
    expect(stripRetiredFromPalette({ weights: { COPPERIUM: 2 }, swaps: [{ from: 'DIRT', to: 'STONE' }] })).toBeNull();
    expect(stripRetiredFromPalette(null)).toBeNull();
  });
});
