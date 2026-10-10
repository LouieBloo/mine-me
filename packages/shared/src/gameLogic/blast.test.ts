import { describe, it, expect } from 'vitest';
import { blastDamageAt } from './blast';
import { isTileBlastProof, MiningTileType } from '../types/mining';

describe('blastDamageAt', () => {
  it('is full at the centre, linear to the minimum fraction at the edge, and zero beyond', () => {
    expect(blastDamageAt(0, 4, 100, 0.25)).toBe(100);
    expect(blastDamageAt(2, 4, 100, 0.25)).toBeCloseTo(62.5);
    expect(blastDamageAt(4, 4, 100, 0.25)).toBeCloseTo(25);
    expect(blastDamageAt(4.01, 4, 100, 0.25)).toBe(0);
  });

  it('is zero for invalid input', () => {
    expect(blastDamageAt(1, 0, 100)).toBe(0);
    expect(blastDamageAt(1, 4, 0)).toBe(0);
    expect(blastDamageAt(NaN, 4, 100)).toBe(0);
  });
});

describe('blast proof tiles', () => {
  it('only the entrance survives explosions; rocks are destroyed like any other block', () => {
    expect(isTileBlastProof(MiningTileType.ENTRANCE)).toBe(true);
    for (const t of [MiningTileType.ROCK, MiningTileType.DIRT, MiningTileType.MINERAL, MiningTileType.CHEST, MiningTileType.LADDER, MiningTileType.TORCH, MiningTileType.COPPERIUM]) {
      expect(isTileBlastProof(t)).toBe(false);
    }
  });
});
