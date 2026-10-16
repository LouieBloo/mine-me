import { describe, it, expect } from 'vitest';
import { MiningTileType, isBridgeItem } from '@mine-me/shared';
import { bridgeItemData, bridgeBlockData, bridgeDropEntry, BRIDGE_ITEM_ID, BRIDGE_TYPE_KEY, BRIDGE_BLOCK_HEALTH } from './add-bridge';

describe('add-bridge', () => {
  it('the item is a hold-to-place consumable the game recognises as a bridge', () => {
    const item = bridgeItemData();
    expect(item.type).toBe('CONSUMABLE');
    expect(item.triggerMode).toBe('HOLD');
    expect(isBridgeItem(item)).toBe(true);
  });

  it('the block key names the BRIDGE tile type', () => {
    expect(MiningTileType[bridgeBlockData().typeKey as keyof typeof MiningTileType]).toBe(MiningTileType.BRIDGE);
    expect(BRIDGE_TYPE_KEY).toBe('BRIDGE');
  });

  it('breaks in one hit of a basic tool and always gives one bridge back', () => {
    expect(bridgeBlockData().health).toBe(BRIDGE_BLOCK_HEALTH);
    expect(BRIDGE_BLOCK_HEALTH).toBeLessThanOrEqual(25);
    expect(bridgeDropEntry()).toEqual({ itemId: BRIDGE_ITEM_ID, chance: 100, minQuantity: 1, maxQuantity: 1 });
  });
});
