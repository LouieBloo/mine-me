import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
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
});
