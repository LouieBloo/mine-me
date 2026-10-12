import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { notificationService } from '../services/notificationService';
import { QuickAccessProvider, useQuickAccess } from './QuickAccessContext';

// Mocks
const mockSendGameEvent = vi.fn();
vi.mock('./SocketContext', () => ({
  useSocket: () => ({
    sendGameEvent: mockSendGameEvent,
  }),
}));

let mockActiveCharacter: any = { id: 'char-1', name: 'Hero' };
let mockPlayerState: any = {
  inventory: {
    items: [],
  },
};

vi.mock('./GameContext', () => ({
  useGame: () => ({
    activeCharacter: mockActiveCharacter,
    playerState: mockPlayerState,
  }),
}));

vi.mock('../services/notificationService', () => ({
  notificationService: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

describe('QuickAccessContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockActiveCharacter = { id: 'char-1', name: 'Hero' };
    mockPlayerState = {
      inventory: {
        items: [
          {
            id: 'inv-ladder-1',
            characterId: 'char-1',
            quantity: 5,
            equipped: false,
            item: {
              id: 'item-ladder-def',
              name: 'Mining Ladder',
              type: 'CONSUMABLE',
              subType: 'LADDER',
            },
          },
          {
            id: 'inv-torch-1',
            characterId: 'char-1',
            quantity: 3,
            equipped: false,
            item: {
              id: 'item-torch-def',
              name: 'Torch',
              type: 'CONSUMABLE',
              subType: 'TORCH',
            },
          },
        ],
      },
    };
  });

  it('assigns items to quick slots and computes total quantity', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QuickAccessProvider>{children}</QuickAccessProvider>
    );

    const { result } = renderHook(() => useQuickAccess(), { wrapper });

    act(() => {
      result.current.setSlotItem(0, 'item-ladder-def');
    });

    expect(result.current.quickSlotItemIds[0]).toBe('item-ladder-def');
    const slot0 = result.current.getSlotEntry(0);
    expect(slot0.entry?.item.name).toBe('Mining Ladder');
    expect(slot0.totalQuantity).toBe(5);
  });

  it('toggles isPlacingLadder when a ladder quick slot is selected', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QuickAccessProvider>{children}</QuickAccessProvider>
    );

    const { result } = renderHook(() => useQuickAccess(), { wrapper });

    act(() => {
      result.current.setSlotItem(0, 'item-ladder-def');
      result.current.setSlotItem(1, 'item-torch-def');
    });

    // Selecting slot 0 (ladder) activates ladder placement mode
    await act(async () => {
      await result.current.selectSlot(0);
    });

    expect(result.current.selectedSlotIndex).toBe(0);
    expect(result.current.isPlacingLadder).toBe(true);
    expect(result.current.isPlacingTorch).toBe(false);

    // Selecting slot 0 again toggles ladder placement mode off
    await act(async () => {
      await result.current.selectSlot(0);
    });

    expect(result.current.isPlacingLadder).toBe(false);

    // Selecting slot 1 (torch) activates torch placement and turns off ladder placement
    await act(async () => {
      await result.current.selectSlot(1);
    });

    expect(result.current.isPlacingTorch).toBe(true);
    expect(result.current.isPlacingLadder).toBe(false);
  });

  it('does not enable isPlacingLadder if player has 0 ladders', async () => {
    mockPlayerState.inventory.items = [
      {
        id: 'inv-ladder-0',
        characterId: 'char-1',
        quantity: 0,
        equipped: false,
        item: {
          id: 'item-ladder-empty',
          name: 'Empty Ladder',
          type: 'CONSUMABLE',
          subType: 'LADDER',
        },
      },
    ];

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QuickAccessProvider>{children}</QuickAccessProvider>
    );

    const { result } = renderHook(() => useQuickAccess(), { wrapper });

    act(() => {
      result.current.setSlotItem(0, 'item-ladder-empty');
    });

    await act(async () => {
      await result.current.selectSlot(0);
    });

    expect(result.current.isPlacingLadder).toBe(false);
  });

  it('keeps isPlacingLadder true when inventory quantity decreases, and turns off when depleted to 0', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QuickAccessProvider>{children}</QuickAccessProvider>
    );

    const { result, rerender } = renderHook(() => useQuickAccess(), { wrapper });

    act(() => {
      result.current.setSlotItem(0, 'item-ladder-def');
    });

    await act(async () => {
      await result.current.selectSlot(0);
    });

    expect(result.current.isPlacingLadder).toBe(true);

    // Quantity decreases from 5 to 2
    mockPlayerState = {
      inventory: {
        items: [
          {
            id: 'inv-ladder-1',
            characterId: 'char-1',
            quantity: 2,
            equipped: false,
            item: {
              id: 'item-ladder-def',
              name: 'Mining Ladder',
              type: 'CONSUMABLE',
              subType: 'LADDER',
            },
          },
        ],
      },
    };
    rerender();

    // Still placing ladder!
    expect(result.current.isPlacingLadder).toBe(true);

    // Quantity drops to 0 (depleted)
    mockPlayerState = {
      inventory: {
        items: [],
      },
    };
    rerender();

    // Now auto-disables placement mode
    expect(result.current.isPlacingLadder).toBe(false);
  });

  it('toggles isThrowingDynamite when dynamite slot is selected', async () => {
    mockPlayerState.inventory.items = [
      {
        id: 'inv-dyn-1',
        characterId: 'char-1',
        quantity: 3,
        equipped: false,
        item: {
          id: 'item-dyn-def',
          name: 'Dynamite',
          type: 'CONSUMABLE',
          subType: 'DYNAMITE',
        },
      },
    ];

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QuickAccessProvider>{children}</QuickAccessProvider>
    );

    const { result, rerender } = renderHook(() => useQuickAccess(), { wrapper });

    act(() => {
      result.current.setSlotItem(0, 'item-dyn-def');
    });

    // Selecting slot 0 (dynamite) activates throw mode
    await act(async () => {
      await result.current.selectSlot(0);
    });

    expect(result.current.isThrowingDynamite).toBe(true);
    expect(result.current.isPlacingTorch).toBe(false);
    expect(result.current.isPlacingLadder).toBe(false);

    // Selecting slot 0 again toggles throw mode off
    await act(async () => {
      await result.current.selectSlot(0);
    });

    expect(result.current.isThrowingDynamite).toBe(false);

    // Turn back on
    await act(async () => {
      await result.current.selectSlot(0);
    });
    expect(result.current.isThrowingDynamite).toBe(true);

    // When dynamite runs out (0 quantity)
    mockPlayerState = { inventory: { items: [] } };
    rerender();
    expect(result.current.isThrowingDynamite).toBe(false);
  });

  describe('ten hotbar slots', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QuickAccessProvider>{children}</QuickAccessProvider>
    );
    const press = (key: string, target: EventTarget = window) =>
      act(() => {
        target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
      });

    it('exposes ten empty slots by default', () => {
      const { result } = renderHook(() => useQuickAccess(), { wrapper });
      expect(result.current.quickSlotItemIds).toHaveLength(10);
      expect(result.current.quickSlotItemIds.every(id => id === null)).toBe(true);
    });

    it('pads a saved 4-slot hotbar with six empty slots and keeps the first four', () => {
      localStorage.setItem('nvg_quick_slots_char-1', JSON.stringify(['a', 'b', null, 'd']));
      const { result } = renderHook(() => useQuickAccess(), { wrapper });
      expect(result.current.quickSlotItemIds).toEqual(['a', 'b', null, 'd', null, null, null, null, null, null]);
    });

    it('sets and swaps slots 5-10 and ignores out-of-range indexes', () => {
      const { result } = renderHook(() => useQuickAccess(), { wrapper });
      act(() => {
        result.current.setSlotItem(9, 'x');
        result.current.setSlotItem(10, 'nope');
      });
      expect(result.current.quickSlotItemIds[9]).toBe('x');
      expect(result.current.quickSlotItemIds).toHaveLength(10);
      act(() => result.current.swapSlots(9, 4));
      expect(result.current.quickSlotItemIds[4]).toBe('x');
      expect(result.current.quickSlotItemIds[9]).toBeNull();
    });

    it.each([
      ['1', 0], ['5', 4], ['9', 8], ['0', 9],
    ])('key %s selects slot index %i', (key, index) => {
      const { result } = renderHook(() => useQuickAccess(), { wrapper });
      press(key);
      expect(result.current.selectedSlotIndex).toBe(index);
    });

    it('ignores hotbar keys typed into an input', () => {
      const { result } = renderHook(() => useQuickAccess(), { wrapper });
      const input = document.createElement('input');
      document.body.appendChild(input);
      press('0', input);
      expect(result.current.selectedSlotIndex).toBeNull();
      input.remove();
    });
  });

  it('equips a gear item from the hotbar without a success toast', async () => {
    mockSendGameEvent.mockResolvedValue({ success: true });
    mockPlayerState = {
      inventory: {
        items: [
          {
            id: 'inv-sword-1',
            quantity: 1,
            equipped: false,
            item: { id: 'item-sword', name: 'Sword', type: 'GEAR' },
          },
        ],
      },
    };
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QuickAccessProvider>{children}</QuickAccessProvider>
    );
    const { result } = renderHook(() => useQuickAccess(), { wrapper });
    act(() => result.current.setSlotItem(0, 'item-sword'));
    await act(async () => {
      await result.current.selectSlot(0);
    });
    expect(mockSendGameEvent).toHaveBeenCalledWith({ type: 'equip_item', inventoryItemId: 'inv-sword-1' });
    expect(notificationService.success).not.toHaveBeenCalled();
  });

  it('still shows an error toast when equipping fails', async () => {
    mockSendGameEvent.mockResolvedValue({ success: false, error: 'Too heavy' });
    mockPlayerState = {
      inventory: {
        items: [
          { id: 'inv-sword-1', quantity: 1, equipped: false, item: { id: 'item-sword', name: 'Sword', type: 'GEAR' } },
        ],
      },
    };
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QuickAccessProvider>{children}</QuickAccessProvider>
    );
    const { result } = renderHook(() => useQuickAccess(), { wrapper });
    act(() => result.current.setSlotItem(0, 'item-sword'));
    await act(async () => {
      await result.current.selectSlot(0);
    });
    expect(notificationService.error).toHaveBeenCalledWith('Error', 'Too heavy');
  });
});
