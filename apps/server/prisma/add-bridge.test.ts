import { describe, it, expect } from 'vitest';
import { isBridgeItem } from '@mine-me/shared';
import { bridgeItemData } from './add-bridge';

describe('add-bridge', () => {
  it('the item is a hold-to-place consumable the game recognises as a bridge', () => {
    const item = bridgeItemData();
    expect(item.type).toBe('CONSUMABLE');
    expect(item.triggerMode).toBe('HOLD');
    expect(isBridgeItem(item)).toBe(true);
  });
});
