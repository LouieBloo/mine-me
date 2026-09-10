import { describe, it, expect } from 'vitest';
import {
  MiningTileType,
  MINING_CONFIG,
  MINING_TILE_DEFINITIONS,
  getTileDefinition,
  canTileBeDamaged,
  isTileMineable,
  isTileSolid,
  isTileClimbable,
  isTileTransparent,
  getTileMineTime,
} from '../src';

describe('Mining Tile Definitions & Helpers', () => {
  it('has a valid definition for every MiningTileType', () => {
    const tileTypes = Object.values(MiningTileType);
    for (const type of tileTypes) {
      const def = MINING_TILE_DEFINITIONS[type];
      expect(def).toBeDefined();
      expect(def.type).toBe(type);
      expect(typeof def.name).toBe('string');
      expect(typeof def.canBeDamaged).toBe('boolean');
      expect(typeof def.isMineable).toBe('boolean');
      expect(typeof def.isSolid).toBe('boolean');
      expect(typeof def.isClimbable).toBe('boolean');
      expect(typeof def.isTransparent).toBe('boolean');
    }
  });

  describe('canTileBeDamaged', () => {
    it('returns true only for damageable tiles (DIRT, MINERAL, CHEST)', () => {
      expect(canTileBeDamaged(MiningTileType.DIRT)).toBe(true);
      expect(canTileBeDamaged(MiningTileType.MINERAL)).toBe(true);
      expect(canTileBeDamaged(MiningTileType.CHEST)).toBe(true);

      // Non-damageable / indestructible tiles
      expect(canTileBeDamaged(MiningTileType.EMPTY)).toBe(false);
      expect(canTileBeDamaged(MiningTileType.ENTRANCE)).toBe(false);
      expect(canTileBeDamaged(MiningTileType.LADDER)).toBe(false);
      expect(canTileBeDamaged(MiningTileType.TORCH)).toBe(false);
      expect(canTileBeDamaged(MiningTileType.ROCK)).toBe(false);
    });
  });

  describe('isTileMineable', () => {
    it('returns true only for blocks that can be mined with a pickaxe', () => {
      expect(isTileMineable(MiningTileType.DIRT)).toBe(true);
      expect(isTileMineable(MiningTileType.MINERAL)).toBe(true);
      expect(isTileMineable(MiningTileType.CHEST)).toBe(true);

      expect(isTileMineable(MiningTileType.EMPTY)).toBe(false);
      expect(isTileMineable(MiningTileType.ENTRANCE)).toBe(false);
      expect(isTileMineable(MiningTileType.LADDER)).toBe(false);
      expect(isTileMineable(MiningTileType.TORCH)).toBe(false);
      expect(isTileMineable(MiningTileType.ROCK)).toBe(false);
    });
  });

  describe('isTileSolid', () => {
    it('returns true for solid obstacles that block physics movement', () => {
      expect(isTileSolid(MiningTileType.DIRT)).toBe(true);
      expect(isTileSolid(MiningTileType.ROCK)).toBe(true);
      expect(isTileSolid(MiningTileType.MINERAL)).toBe(true);
      expect(isTileSolid(MiningTileType.CHEST)).toBe(true);

      // Non-solid walkable/passable tiles
      expect(isTileSolid(MiningTileType.EMPTY)).toBe(false);
      expect(isTileSolid(MiningTileType.ENTRANCE)).toBe(false);
      expect(isTileSolid(MiningTileType.LADDER)).toBe(false);
      expect(isTileSolid(MiningTileType.TORCH)).toBe(false);
    });
  });

  describe('isTileClimbable', () => {
    it('returns true only for ladder tiles', () => {
      expect(isTileClimbable(MiningTileType.LADDER)).toBe(true);
      expect(isTileClimbable(MiningTileType.EMPTY)).toBe(false);
      expect(isTileClimbable(MiningTileType.TORCH)).toBe(false);
      expect(isTileClimbable(MiningTileType.DIRT)).toBe(false);
    });
  });

  describe('isTileTransparent', () => {
    it('returns true for tiles that let sunlight through', () => {
      expect(isTileTransparent(MiningTileType.EMPTY)).toBe(true);
      expect(isTileTransparent(MiningTileType.ENTRANCE)).toBe(true);
      expect(isTileTransparent(MiningTileType.LADDER)).toBe(true);
      expect(isTileTransparent(MiningTileType.TORCH)).toBe(true);

      expect(isTileTransparent(MiningTileType.DIRT)).toBe(false);
      expect(isTileTransparent(MiningTileType.ROCK)).toBe(false);
      expect(isTileTransparent(MiningTileType.MINERAL)).toBe(false);
      expect(isTileTransparent(MiningTileType.CHEST)).toBe(false);
    });
  });

  describe('getTileMineTime', () => {
    it('returns configured mine times for mineable tiles and default for others', () => {
      expect(getTileMineTime(MiningTileType.DIRT)).toBe(MINING_CONFIG.DIRT_MINE_TIME_MS);
      expect(getTileMineTime(MiningTileType.MINERAL)).toBe(MINING_CONFIG.MINERAL_MINE_TIME_MS);
      expect(getTileMineTime(MiningTileType.CHEST)).toBe(MINING_CONFIG.CHEST_MINE_TIME_MS);
      expect(getTileMineTime(MiningTileType.EMPTY)).toBe(MINING_CONFIG.DIRT_MINE_TIME_MS);
    });
  });

  describe('getTileDefinition fallback', () => {
    it('falls back to EMPTY definition when an unknown tile type is provided', () => {
      const fallback = getTileDefinition(999 as any);
      expect(fallback.type).toBe(MiningTileType.EMPTY);
      expect(fallback.canBeDamaged).toBe(false);
    });
  });
});
