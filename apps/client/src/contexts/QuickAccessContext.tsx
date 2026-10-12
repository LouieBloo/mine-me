import React, { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { useGame } from './GameContext';
import { useSocket } from './SocketContext';
import { notificationService } from '../services/notificationService';
import type { InventoryEntry, GameItem } from '@mine-me/shared';
import { isTorchItem, isLadderItem, isThrowableItem } from '@mine-me/shared';
import { QUICK_SLOT_COUNT, slotIndexForKey } from './quickSlots';

interface QuickAccessContextType {
  /** 4 quick slots storing item definition IDs (or null if empty) */
  quickSlotItemIds: (string | null)[];
  /** Currently selected slot index (0-3), or null if none */
  selectedSlotIndex: number | null;
  /** Set or clear a specific quick slot */
  setSlotItem: (slotIndex: number, itemDefinitionId: string | null) => void;
  /** Swap two slots */
  swapSlots: (fromIndex: number, toIndex: number) => void;
  /** Select and activate the item at slotIndex (0-3) */
  selectSlot: (slotIndex: number) => Promise<void>;
  /** Get the live inventory entry and total quantity for a given slot index */
  getSlotEntry: (slotIndex: number) => { entry: InventoryEntry | null; totalQuantity: number };
  /** Whether torch placement mode is currently active */
  isPlacingTorch: boolean;
  setIsPlacingTorch: React.Dispatch<React.SetStateAction<boolean>>;
  /** Whether ladder placement mode is currently active */
  isPlacingLadder: boolean;
  setIsPlacingLadder: React.Dispatch<React.SetStateAction<boolean>>;
  /** Currently selected throwable item, if throwing mode is active */
  activeThrowableItem: GameItem | null;
  /** Whether throwable object mode is currently active */
  isThrowingItem: boolean;
  setIsThrowingItem: React.Dispatch<React.SetStateAction<boolean>>;
  /** Backwards compatibility alias for dynamite */
  isThrowingDynamite: boolean;
  setIsThrowingDynamite: React.Dispatch<React.SetStateAction<boolean>>;
}

const QuickAccessContext = createContext<QuickAccessContextType | undefined>(undefined);


export const QuickAccessProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { activeCharacter, playerState } = useGame();
  const { sendGameEvent } = useSocket();

  const [quickSlotItemIds, setQuickSlotItemIds] = useState<(string | null)[]>(() => {
    return Array(QUICK_SLOT_COUNT).fill(null);
  });

  const [selectedSlotIndex, setSelectedSlotIndex] = useState<number | null>(null);
  const [isPlacingTorch, setIsPlacingTorch] = useState<boolean>(false);
  const [isPlacingLadder, setIsPlacingLadder] = useState<boolean>(false);
  const [isThrowingItem, setIsThrowingItem] = useState<boolean>(false);
  const [activeThrowableItem, setActiveThrowableItem] = useState<GameItem | null>(null);

  // Load persisted quick slots when activeCharacter changes
  useEffect(() => {
    if (!activeCharacter?.id) {
      setQuickSlotItemIds(Array(QUICK_SLOT_COUNT).fill(null));
      setSelectedSlotIndex(null);
      return;
    }

    try {
      const saved = localStorage.getItem(`nvg_quick_slots_${activeCharacter.id}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const slots = Array(QUICK_SLOT_COUNT).fill(null);
          for (let i = 0; i < QUICK_SLOT_COUNT; i++) {
            slots[i] = parsed[i] ?? null;
          }
          setQuickSlotItemIds(slots);
          return;
        }
      }
    } catch (err) {
      console.warn('Failed to load saved quick slots from localStorage:', err);
    }

    setQuickSlotItemIds(Array(QUICK_SLOT_COUNT).fill(null));
  }, [activeCharacter?.id]);

  // Persist quick slots when changed
  const persistQuickSlots = useCallback((slots: (string | null)[]) => {
    if (!activeCharacter?.id) return;
    try {
      localStorage.setItem(`nvg_quick_slots_${activeCharacter.id}`, JSON.stringify(slots));
    } catch (err) {
      console.warn('Failed to save quick slots to localStorage:', err);
    }
  }, [activeCharacter?.id]);

  const setSlotItem = useCallback((slotIndex: number, itemDefId: string | null) => {
    if (slotIndex < 0 || slotIndex >= QUICK_SLOT_COUNT) return;
    setQuickSlotItemIds(prev => {
      const next = [...prev];
      // If this item was already assigned to another slot, clear that slot to avoid duplicates
      if (itemDefId) {
        for (let i = 0; i < QUICK_SLOT_COUNT; i++) {
          if (next[i] === itemDefId) {
            next[i] = null;
          }
        }
      }
      next[slotIndex] = itemDefId;
      persistQuickSlots(next);
      return next;
    });
  }, [persistQuickSlots]);

  const swapSlots = useCallback((fromIndex: number, toIndex: number) => {
    if (fromIndex < 0 || fromIndex >= QUICK_SLOT_COUNT || toIndex < 0 || toIndex >= QUICK_SLOT_COUNT) return;
    setQuickSlotItemIds(prev => {
      const next = [...prev];
      const temp = next[fromIndex];
      next[fromIndex] = next[toIndex];
      next[toIndex] = temp;
      persistQuickSlots(next);
      return next;
    });
  }, [persistQuickSlots]);

  const playerStateRef = useRef(playerState);
  playerStateRef.current = playerState;
  const quickSlotItemIdsRef = useRef(quickSlotItemIds);
  quickSlotItemIdsRef.current = quickSlotItemIds;

  // Auto-disable placement modes when the player runs out of that consumable
  useEffect(() => {
    if (isPlacingTorch) {
      const torchCount = playerState?.inventory?.items
        ? playerState.inventory.items
            .filter((inv) => isTorchItem(inv.item))
            .reduce((sum, inv) => sum + inv.quantity, 0)
        : 0;
      if (torchCount === 0) {
        setIsPlacingTorch(false);
      }
    }
    if (isPlacingLadder) {
      const ladderCount = playerState?.inventory?.items
        ? playerState.inventory.items
            .filter((inv) => isLadderItem(inv.item))
            .reduce((sum, inv) => sum + inv.quantity, 0)
        : 0;
      if (ladderCount === 0) {
        setIsPlacingLadder(false);
      }
    }
    if (isThrowingItem) {
      const throwableCount = playerState?.inventory?.items
        ? playerState.inventory.items
            .filter((inv) => {
              const it = inv.item;
              if (activeThrowableItem?.id) {
                return it?.id === activeThrowableItem.id;
              }
              return isThrowableItem(it);
            })
            .reduce((sum, inv) => sum + inv.quantity, 0)
        : 0;
      if (throwableCount === 0) {
        setIsThrowingItem(false);
        setActiveThrowableItem(null);
      }
    }
  }, [playerState?.inventory?.items, isPlacingTorch, isPlacingLadder, isThrowingItem, activeThrowableItem]);

  // Derive live inventory entry directly from playerState.inventory.items
  const getSlotEntry = useCallback((slotIndex: number): { entry: InventoryEntry | null; totalQuantity: number } => {
    const itemDefId = quickSlotItemIdsRef.current[slotIndex];
    if (!itemDefId || !playerStateRef.current?.inventory?.items) {
      return { entry: null, totalQuantity: 0 };
    }

    const items = playerStateRef.current.inventory.items as InventoryEntry[];
    const matchingItems = items.filter((e: InventoryEntry) => e.item.id === itemDefId);
    if (matchingItems.length === 0) {
      return { entry: null, totalQuantity: 0 };
    }

    const totalQuantity = matchingItems.reduce((sum: number, e: InventoryEntry) => sum + e.quantity, 0);
    // Return the first entry (or equipped entry if applicable) for details/icon
    const primaryEntry = matchingItems.find((e: InventoryEntry) => e.equipped) || matchingItems[0];

    return { entry: primaryEntry, totalQuantity };
  }, []);

  // Select and perform the slot action
  const selectSlot = useCallback(async (slotIndex: number) => {
    if (slotIndex < 0 || slotIndex >= QUICK_SLOT_COUNT) return;

    setSelectedSlotIndex(slotIndex);

    const { entry, totalQuantity } = getSlotEntry(slotIndex);
    if (!entry) {
      setIsPlacingTorch(false);
      setIsPlacingLadder(false);
      return;
    }

    const item = entry.item;
    const isTorch = isTorchItem(item);
    const isLadder = isLadderItem(item);
    const isThrowable = isThrowableItem(item);

    if (isThrowable) {
      if (totalQuantity <= 0) {
        notificationService.error(`No ${item.name}`, `You do not have any ${item.name} left.`);
        setIsThrowingItem(false);
        setActiveThrowableItem(null);
        return;
      }
      setIsPlacingTorch(false);
      setIsPlacingLadder(false);
      setIsThrowingItem((prev) => {
        const next = !prev;
        setActiveThrowableItem(next ? item : null);
        return next;
      });
      return;
    }

    if (isTorch) {
      if (totalQuantity <= 0) {
        notificationService.error('No Torches', 'You do not have any torches left.');
        setIsPlacingTorch(false);
        return;
      }
      setIsPlacingLadder(false);
      setIsThrowingItem(false);
      setActiveThrowableItem(null);
      setIsPlacingTorch(prev => !prev);
      return;
    }

    if (isLadder) {
      if (totalQuantity <= 0) {
        notificationService.error('No Ladders', 'You do not have any ladders left.');
        setIsPlacingLadder(false);
        return;
      }
      setIsPlacingTorch(false);
      setIsThrowingItem(false);
      setActiveThrowableItem(null);
      setIsPlacingLadder(prev => !prev);
      return;
    }

    // Reset placement and throwing modes if switching to another item
    setIsPlacingTorch(false);
    setIsPlacingLadder(false);
    setIsThrowingItem(false);
    setActiveThrowableItem(null);

    if (item.type === 'GEAR') {
      if (!entry.equipped) {
        try {
          const res = await sendGameEvent({
            type: 'equip_item',
            inventoryItemId: entry.id,
          });
          if (!res.success) {
            notificationService.error('Error', res.error || 'Failed to equip item.');
          }
        } catch (err: any) {
          notificationService.error('Error', err.message || 'Failed to equip item.');
        }
      }
    } else if (item.type === 'CONSUMABLE') {
      try {
        const res = await sendGameEvent({
          type: 'consume_item',
          inventoryItemId: entry.id,
        });
        if (res.success) {
          notificationService.success(
            'Consumed Item',
            `You consumed ${item.name}.`
          );
        } else {
          notificationService.error('Error', res.error || 'Failed to consume item.');
        }
      } catch (err: any) {
        notificationService.error('Error', err.message || 'Failed to consume item.');
      }
    }
  }, [getSlotEntry, sendGameEvent]);

  // Keyboard shortcut listener for keys 1-9 and 0
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is in an input field or textarea
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }

      const slotIndex = slotIndexForKey(e.key);
      if (slotIndex !== null) {
        e.preventDefault();
        selectSlot(slotIndex);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectSlot]);

  return (
    <QuickAccessContext.Provider
      value={{
        quickSlotItemIds,
        selectedSlotIndex,
        setSlotItem,
        swapSlots,
        selectSlot,
        getSlotEntry,
        isPlacingTorch,
        setIsPlacingTorch,
        isPlacingLadder,
        setIsPlacingLadder,
        activeThrowableItem,
        isThrowingItem,
        setIsThrowingItem,
        isThrowingDynamite: isThrowingItem,
        setIsThrowingDynamite: setIsThrowingItem,
      }}
    >
      {children}
    </QuickAccessContext.Provider>
  );
};

export const useQuickAccess = (): QuickAccessContextType => {
  const context = useContext(QuickAccessContext);
  if (!context) {
    throw new Error('useQuickAccess must be used within a QuickAccessProvider');
  }
  return context;
};
