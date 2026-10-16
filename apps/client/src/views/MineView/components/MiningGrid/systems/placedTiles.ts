import { MiningTileType, PLACED_ITEM_TILES, placedTileTextureUrl } from '@mine-me/shared';

/** Art used for a placed tile while no item for it has any (kept from before items owned their tile art). */
export const PLACED_TILE_FALLBACK_URLS: Partial<Record<MiningTileType, string>> = {
  [MiningTileType.TORCH]: '/assets/icons/items/cmt4m445e0000xx0vdu7ve6q0_icon.png',
  [MiningTileType.LADDER]: '/assets/mining/block_entrance-block.png',
};

/** Which texture url each item-placed tile should load, from the item definitions: the item's own art, else the fallback. Tiles with neither are left out. */
export function placedTileUrls(items: readonly any[]): { tileType: MiningTileType; url: string }[] {
  const out: { tileType: MiningTileType; url: string }[] = [];
  for (const { tileType, matches } of PLACED_ITEM_TILES) {
    const url = placedTileTextureUrl(items.find((i) => matches(i))) ?? PLACED_TILE_FALLBACK_URLS[tileType];
    if (url) out.push({ tileType, url });
  }
  return out;
}
