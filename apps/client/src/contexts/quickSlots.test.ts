import { describe, it, expect } from 'vitest';
import { QUICK_SLOT_COUNT, QUICK_SLOT_KEYS, slotIndexForKey, keyLabelForSlot } from './quickSlots';

describe('quickSlots', () => {
  it('has ten slots, one key each', () => {
    expect(QUICK_SLOT_COUNT).toBe(10);
    expect(QUICK_SLOT_KEYS).toHaveLength(QUICK_SLOT_COUNT);
  });

  it('maps keys 1-9 to slots 0-8 and key 0 to slot 9', () => {
    for (let n = 1; n <= 9; n++) expect(slotIndexForKey(String(n))).toBe(n - 1);
    expect(slotIndexForKey('0')).toBe(9);
  });

  it('returns null for non-hotbar keys', () => {
    expect(slotIndexForKey('a')).toBeNull();
    expect(slotIndexForKey('10')).toBeNull();
    expect(slotIndexForKey('')).toBeNull();
  });

  it('labels slots 1-9 then 0, and round-trips with slotIndexForKey', () => {
    expect(keyLabelForSlot(0)).toBe('1');
    expect(keyLabelForSlot(8)).toBe('9');
    expect(keyLabelForSlot(9)).toBe('0');
    for (let i = 0; i < QUICK_SLOT_COUNT; i++) expect(slotIndexForKey(keyLabelForSlot(i))).toBe(i);
  });
});
