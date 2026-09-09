import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { QuickAccessProvider, useQuickAccess } from '../../src/contexts/QuickAccessContext';
import * as GameContextModule from '../../src/contexts/GameContext';
import * as SocketContextModule from '../../src/contexts/SocketContext';

describe('QuickAccessContext', () => {
  const mockSendGameEvent = vi.fn().mockResolvedValue({ success: true });
  const mockActiveCharacter = { id: 'char-1', name: 'TestHero' } as any;

  const mockPlayerState = {
    id: 'char-1',
    inventory: {
      slots: 20,
      items: [
        {
          id: 'inv-torch-1',
          quantity: 3,
          equipped: false,
          item: {
            id: 'item-torch-id',
            name: 'Torch',
            type: 'CONSUMABLE',
            subType: 'TORCH',
          },
        },
        {
          id: 'inv-sword-1',
          quantity: 1,
          equipped: false,
          item: {
            id: 'item-sword-id',
            name: 'Iron Sword',
            type: 'GEAR',
            subType: 'WEAPON',
          },
        },
      ],
    },
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();

    vi.spyOn(GameContextModule, 'useGame').mockReturnValue({
      activeCharacter: mockActiveCharacter,
      playerState: mockPlayerState,
      setActiveCharacter: vi.fn(),
      activeCity: null,
      setActiveCity: vi.fn(),
      setPlayerState: vi.fn(),
      applyStatUpdate: vi.fn(),
      displayPlayerHealth: null,
      setDisplayPlayerHealth: vi.fn(),
      clearGameState: vi.fn(),
      miningSession: null,
      setMiningSession: vi.fn(),
    });

    vi.spyOn(SocketContextModule, 'useSocket').mockReturnValue({
      sendGameEvent: mockSendGameEvent,
      isConnected: true,
      selectCharacter: vi.fn(),
      joinCity: vi.fn(),
      leaveCity: vi.fn(),
      sendCityMessage: vi.fn(),
      onEvent: vi.fn(),
    });
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QuickAccessProvider>{children}</QuickAccessProvider>
  );

  it('initializes with 4 empty slots and loads from localStorage', () => {
    const { result } = renderHook(() => useQuickAccess(), { wrapper });

    expect(result.current.quickSlotItemIds).toEqual([null, null, null, null]);
    expect(result.current.selectedSlotIndex).toBe(null);
  });

  it('updates slot and persists to localStorage', () => {
    const { result } = renderHook(() => useQuickAccess(), { wrapper });

    act(() => {
      result.current.setSlotItem(0, 'item-torch-id');
    });

    expect(result.current.quickSlotItemIds[0]).toBe('item-torch-id');
    expect(localStorage.getItem('nvg_quick_slots_char-1')).toBe(
      JSON.stringify(['item-torch-id', null, null, null])
    );
  });

  it('reactively retrieves live inventory entry and total quantity from GameContext', () => {
    const { result } = renderHook(() => useQuickAccess(), { wrapper });

    act(() => {
      result.current.setSlotItem(0, 'item-torch-id');
    });

    const slot0 = result.current.getSlotEntry(0);
    expect(slot0.entry).toBeDefined();
    expect(slot0.entry?.item.name).toBe('Torch');
    expect(slot0.totalQuantity).toBe(3);

    // Empty slot
    const slot1 = result.current.getSlotEntry(1);
    expect(slot1.entry).toBe(null);
    expect(slot1.totalQuantity).toBe(0);
  });

  it('equips gear when a gear slot is selected', async () => {
    const { result } = renderHook(() => useQuickAccess(), { wrapper });

    act(() => {
      result.current.setSlotItem(1, 'item-sword-id');
    });

    await act(async () => {
      await result.current.selectSlot(1);
    });

    expect(result.current.selectedSlotIndex).toBe(1);
    expect(mockSendGameEvent).toHaveBeenCalledWith({
      type: 'equip_item',
      inventoryItemId: 'inv-sword-1',
    });
  });

  it('toggles torch placement when selecting a torch slot', async () => {
    const { result } = renderHook(() => useQuickAccess(), { wrapper });

    act(() => {
      result.current.setSlotItem(0, 'item-torch-id');
    });

    expect(result.current.isPlacingTorch).toBe(false);

    await act(async () => {
      await result.current.selectSlot(0);
    });

    expect(result.current.isPlacingTorch).toBe(true);

    await act(async () => {
      await result.current.selectSlot(0);
    });

    expect(result.current.isPlacingTorch).toBe(false);
  });

  it('responds to keyboard events 1-4', () => {
    const { result } = renderHook(() => useQuickAccess(), { wrapper });

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '2' }));
    });

    expect(result.current.selectedSlotIndex).toBe(1);
  });
});
