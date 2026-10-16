import { describe, it, expect } from 'vitest';
import { MiningTileType } from '@mine-me/shared';
import { placedTileUrls, PLACED_TILE_FALLBACK_URLS } from './placedTiles';

const urlOf = (list: ReturnType<typeof placedTileUrls>, tile: MiningTileType) => list.find((e) => e.tileType === tile)?.url;

describe('placedTileUrls', () => {
  it("uses the placing item's in-game sprite, or its icon when it has none", () => {
    const urls = placedTileUrls([
      { subType: 'BRIDGE', inGameSpriteUrl: '/sprites/bridge.png', iconUrl: '/icons/bridge.png' },
      { subType: 'LADDER', inGameSpriteUrl: null, iconUrl: '/icons/ladder.png' },
    ]);
    expect(urlOf(urls, MiningTileType.BRIDGE)).toBe('/sprites/bridge.png');
    expect(urlOf(urls, MiningTileType.LADDER)).toBe('/icons/ladder.png');
  });

  it('falls back for torch and ladder when no item has art, and skips a bridge with none', () => {
    const urls = placedTileUrls([]);
    expect(urlOf(urls, MiningTileType.TORCH)).toBe(PLACED_TILE_FALLBACK_URLS[MiningTileType.TORCH]);
    expect(urlOf(urls, MiningTileType.LADDER)).toBe(PLACED_TILE_FALLBACK_URLS[MiningTileType.LADDER]);
    expect(urlOf(urls, MiningTileType.BRIDGE)).toBeUndefined();
    expect(placedTileUrls([{ subType: 'BRIDGE' }]).some((e) => e.tileType === MiningTileType.BRIDGE)).toBe(false);
  });
});
