import { describe, it, expect } from 'vitest';
import { MiningTileType, MINING_TILE_DEFINITIONS } from '@mine-me/shared';
import { lavarockBlockData, LAVAROCK_TYPE_KEY, LAVAROCK_HEALTH } from './add-lavarock';

describe('add-lavarock', () => {
  it('the block key names the LAVAROCK tile type', () => {
    expect(MiningTileType[lavarockBlockData().typeKey as keyof typeof MiningTileType]).toBe(MiningTileType.LAVAROCK);
    expect(LAVAROCK_TYPE_KEY).toBe('LAVAROCK');
  });

  it('is tougher than any ore, and mineable with any tool for now', () => {
    expect(LAVAROCK_HEALTH).toBeGreaterThan(MINING_TILE_DEFINITIONS[MiningTileType.SILVERIUM].health!);
    expect(lavarockBlockData().health).toBe(LAVAROCK_HEALTH);
    expect(lavarockBlockData().requiredPickPower).toBe(0);
  });

  it('is a solid, mineable, damageable tile', () => {
    const def = MINING_TILE_DEFINITIONS[MiningTileType.LAVAROCK];
    expect(def.isSolid && def.isMineable && def.canBeDamaged).toBe(true);
  });

  it('starts with the rock texture until real art is uploaded', () => {
    expect(lavarockBlockData().textureUrl).toBe('/assets/mining/block_rock-block.jpg');
  });
});
