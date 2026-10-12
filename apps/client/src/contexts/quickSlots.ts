/** Number of hotbar slots. Keys 1-9 select slots 1-9, key 0 selects slot 10. */
export const QUICK_SLOT_COUNT = 10;

/** Keyboard key for each slot index, in slot order. */
export const QUICK_SLOT_KEYS: readonly string[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

/** Slot index for a pressed key, or null if the key is not a hotbar key. */
export function slotIndexForKey(key: string): number | null {
  const index = QUICK_SLOT_KEYS.indexOf(key);
  return index === -1 || index >= QUICK_SLOT_COUNT ? null : index;
}

/** Key label shown on a slot (1-9, then 0). */
export function keyLabelForSlot(slotIndex: number): string {
  return QUICK_SLOT_KEYS[slotIndex] ?? '';
}
