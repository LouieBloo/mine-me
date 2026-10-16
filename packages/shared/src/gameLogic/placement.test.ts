import { describe, it, expect } from 'vitest';
import { MiningTileType, MINING_TILE_DEFINITIONS, bodyOverlapsCell, canPlaceBuildable, isTileMineable, isTileSolid } from '../types/mining';
import { getItemRoles, isBridgeItem, ITEM_ROLE_WHERE } from './itemRoles';

describe('canPlaceBuildable', () => {
  it('allows only empty space, for every kind of buildable', () => {
    for (const buildable of [MiningTileType.LADDER, MiningTileType.TORCH, MiningTileType.BRIDGE]) {
      expect(canPlaceBuildable(buildable, MiningTileType.EMPTY)).toBe(true);
      for (const target of Object.values(MiningTileType)) {
        if (target !== MiningTileType.EMPTY) expect(canPlaceBuildable(buildable, target)).toBe(false);
      }
    }
  });
});

describe('the bridge tile', () => {
  it('is solid, mineable and blocks light', () => {
    const def = MINING_TILE_DEFINITIONS[MiningTileType.BRIDGE];
    expect(isTileSolid(MiningTileType.BRIDGE)).toBe(true);
    expect(isTileMineable(MiningTileType.BRIDGE)).toBe(true);
    expect(def.isClimbable).toBe(false);
    expect(def.isTransparent).toBe(false);
  });
});

describe('bridge items', () => {
  it('are found by subType, in any case', () => {
    expect(isBridgeItem({ subType: 'BRIDGE' } as any)).toBe(true);
    expect(isBridgeItem({ subType: 'bridge' } as any)).toBe(true);
    expect(isBridgeItem({ subType: 'LADDER' } as any)).toBe(false);
    expect(getItemRoles({ subType: 'BRIDGE' } as any)).toEqual(['BRIDGE']);
    expect(ITEM_ROLE_WHERE.bridge).toEqual({ subType: { equals: 'BRIDGE', mode: 'insensitive' } });
  });
});

describe('bodyOverlapsCell', () => {
  it('is true inside the cell, false beside it, and false when only touching', () => {
    expect(bodyOverlapsCell({ x: 5.5, y: 5.5 }, 0.3, 0.4, 5, 5)).toBe(true);
    expect(bodyOverlapsCell({ x: 5.9, y: 5.5 }, 0.3, 0.4, 5, 5)).toBe(true);
    expect(bodyOverlapsCell({ x: 7.5, y: 5.5 }, 0.3, 0.4, 5, 5)).toBe(false);
    // Standing on the cell below: feet exactly at its top edge
    expect(bodyOverlapsCell({ x: 5.5, y: 5 - 0.4 }, 0.3, 0.4, 5, 5)).toBe(false);
  });
});

describe('item-placed tiles', () => {
  it('lists torch, ladder and bridge, matched by the placing item, with art from the item', async () => {
    const { PLACED_ITEM_TILES, isItemPlacedBlockKey, placedTileTextureUrl } = await import('./itemRoles');
    expect(PLACED_ITEM_TILES.map((p) => p.tileType)).toEqual([MiningTileType.TORCH, MiningTileType.LADDER, MiningTileType.BRIDGE]);
    expect(PLACED_ITEM_TILES.find((p) => p.matches({ subType: 'BRIDGE' } as any))?.tileType).toBe(MiningTileType.BRIDGE);
    expect(isItemPlacedBlockKey('BRIDGE')).toBe(true);
    expect(isItemPlacedBlockKey('DIRT')).toBe(false);
    expect(placedTileTextureUrl({ inGameSpriteUrl: '/s.png', iconUrl: '/i.png' })).toBe('/s.png');
    expect(placedTileTextureUrl({ inGameSpriteUrl: null, iconUrl: '/i.png' })).toBe('/i.png');
    expect(placedTileTextureUrl(null)).toBeNull();
  });
});
