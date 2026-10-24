import { describe, it, expect } from 'vitest';
import { MiningTileType, MINING_TILE_DEFINITIONS, getTileDefinition, isTileBlastProof } from '@mine-me/shared';
import { BASIC_BLOCKS, basicBlockData, BASIC_BLOCK_PLACEHOLDER_TEXTURE } from './add-basic-blocks';
import { blockKeyForTileType, tileTypeForBlockKey, BLOCK_TILE_TYPES } from '../src/services/mining/subsystems/MiningDataManager';

describe('add-basic-blocks', () => {
  it('every block key names its tile type, and the data manager knows the key both ways', () => {
    for (const block of BASIC_BLOCKS) {
      const type = MiningTileType[block.typeKey];
      expect(type).toBeDefined();
      expect(blockKeyForTileType(type)).toBe(block.typeKey);
      expect(tileTypeForBlockKey(block.typeKey)).toBe(type);
      expect(BLOCK_TILE_TYPES).toContain(type);
    }
  });

  it('builds a row per block: unique ids, the tile health, no pick power needed, the placeholder texture', () => {
    const rows = BASIC_BLOCKS.map(basicBlockData);
    expect(new Set(rows.map((r) => r.id)).size).toBe(BASIC_BLOCKS.length);
    for (const row of rows) {
      expect(row.requiredPickPower).toBe(0);
      expect(row.textureUrl).toBe(BASIC_BLOCK_PLACEHOLDER_TEXTURE);
      expect(row.health).toBe(MINING_TILE_DEFINITIONS[MiningTileType[row.typeKey]].health ?? 0);
    }
  });

  it('orders the diggable blocks from soft to hard, between dirt-like and ore-like', () => {
    const health = (k: keyof typeof MiningTileType) => getTileDefinition(MiningTileType[k]).health!;
    expect(health('GRAVEL')).toBeLessThan(health('CLAY') + 1);
    expect(health('CLAY')).toBeLessThan(health('SANDSTONE'));
    expect(health('SANDSTONE')).toBeLessThan(health('ICE'));
    expect(health('ICE')).toBeLessThan(health('STONE'));
    expect(health('STONE')).toBeLessThan(health('LAVAROCK'));
  });

  it('are solid, diggable terrain, except bedrock, which cannot be damaged and survives blasts', () => {
    for (const block of BASIC_BLOCKS.filter((b) => b.typeKey !== 'BEDROCK')) {
      const def = getTileDefinition(MiningTileType[block.typeKey]);
      expect(def.isSolid && def.isMineable && def.canBeDamaged && !def.isTransparent).toBe(true);
    }
    const bedrock = getTileDefinition(MiningTileType.BEDROCK);
    expect(bedrock.isSolid).toBe(true);
    expect(bedrock.canBeDamaged || bedrock.isMineable).toBe(false);
    expect(isTileBlastProof(MiningTileType.BEDROCK)).toBe(true);
  });
});
