import { describe, it, expect, vi, beforeEach } from 'vitest';
import React, { useState } from 'react';
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MineView } from '../src/views/MineView/MineView';
import { GameProvider, useGame } from '../src/contexts/GameContext';

// Mock sub-components that use Pixi or complex DOM
vi.mock('../src/views/MineView/components/MiningGrid/MiningGrid', () => ({
  MiningGrid: () => <div data-testid="mining-grid">Mining Grid</div>,
}));

vi.mock('../src/views/MineView/components/MiningHUD/MiningHUD', () => ({
  MiningHUD: () => <div data-testid="mining-hud">Mining HUD</div>,
}));

vi.mock('../src/views/MineView/components/MiningLoadingScreen/MiningLoadingScreen', () => ({
  MiningLoadingScreen: () => <div data-testid="loading-screen">Loading</div>,
}));

vi.mock('../src/components/game/PixiStageContext/PixiStageContext', () => ({
  PixiStageProvider: ({ children }: any) => <div>{children}</div>,
  usePixiStage: () => ({ app: null }),
}));

let mockSendGameEvent = vi.fn();
let mockOnEvent = vi.fn();
let mockSelectSlot = vi.fn();

vi.mock('../src/contexts/SocketContext', () => ({
  useSocket: () => ({
    isConnected: true,
    selectCharacter: vi.fn(),
    joinCity: vi.fn(),
    leaveCity: vi.fn(),
    sendCityMessage: vi.fn(),
    sendGameEvent: mockSendGameEvent,
    onEvent: mockOnEvent,
  }),
}));

vi.mock('../src/contexts/QuickAccessContext', () => ({
  useQuickAccess: () => ({
    quickSlotItemIds: [null, null, null, null],
    selectedSlotIndex: 0,
    selectSlot: mockSelectSlot,
    setSlotItem: vi.fn(),
    swapSlots: vi.fn(),
    getSlotEntry: vi.fn(),
    isPlacingTorch: false,
    setIsPlacingTorch: vi.fn(),
    isPlacingLadder: false,
    setIsPlacingLadder: vi.fn(),
  }),
}));

const mockActiveCharacter = {
  id: 'char-123',
  name: 'TestMiner',
  class: 'Warrior',
  level: 1,
  sol: 100,
  lear: 0,
  stamina: 100,
  maxStamina: 100,
  combatScore: 10,
  defenseScore: 10,
  ageInDays: 5000,
  cityId: 'city-1',
  status: 'ACTIVE',
  createdAt: new Date().toISOString(),
};

const mockPlayerState = {
  character: mockActiveCharacter,
  inventory: { items: [], capacity: 20 },
  attributes: {
    health: 100,
    maxHealth: 100,
    stamina: 100,
    maxStamina: 100,
  },
  cityId: 'city-1',
};

describe('MineView Navigation & Session Lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem('nvg_active_character', JSON.stringify(mockActiveCharacter));
    localStorage.setItem('nvg_player_state', JSON.stringify(mockPlayerState));
    mockSendGameEvent.mockResolvedValue({ success: true });
    mockOnEvent.mockReturnValue(() => {});
    mockSelectSlot.mockResolvedValue(true);
  });

  it('shows ExpeditionModeModal on initial mount when miningSession is null', () => {
    render(
      <MemoryRouter>
        <GameProvider>
          <MineView />
        </GameProvider>
      </MemoryRouter>
    );

    // Mode modal should be rendered asking to choose mode
    expect(screen.getByText(/Select Mining Expedition/i)).toBeDefined();
    expect(screen.getByText(/Single Player/i)).toBeDefined();
    expect(screen.getByText(/Multiplayer Lobby/i)).toBeDefined();
  });

  it('cancels session on the server and clears miningSession from context when unmounted', async () => {
    let capturedMiningSession: any = 'uninitialized';
    const SessionInspector = () => {
      const { miningSession } = useGame();
      capturedMiningSession = miningSession;
      return null;
    };

    let setMountedState: (val: boolean) => void = () => {};

    const NavigationContainer = () => {
      const [mounted, setMounted] = useState(true);
      setMountedState = setMounted;
      return (
        <GameProvider>
          <SessionInspector />
          {mounted && <MineView />}
        </GameProvider>
      );
    };

    render(
      <MemoryRouter>
        <NavigationContainer />
      </MemoryRouter>
    );

    // Simulate starting a single player session
    mockSendGameEvent.mockResolvedValueOnce({
      success: true,
      data: {
        sessionState: {
          grid: [],
          position: { x: 15, y: 0 },
          droppedItems: [],
          temporaryBackpack: [],
          visionRange: 3,
          canExtract: true,
          isMining: false,
        },
      },
    });

    const soloButton = screen.getByText(/Single Player/i);
    await act(async () => {
      soloButton.click();
    });

    expect(mockSendGameEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'mining_start', mode: 'singleplayer' })
    );
    expect(capturedMiningSession).not.toBeNull();

    // Now simulate navigating away (e.g. browser back button unmounting MineView)
    await act(async () => {
      setMountedState(false);
    });

    // Verify mining_cancel was sent
    expect(mockSendGameEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'mining_cancel' })
    );

    // Verify miningSession in GameContext was cleared to null
    expect(capturedMiningSession).toBeNull();

    // Now simulate navigating forward or clicking Mine again (remounting MineView)
    await act(async () => {
      setMountedState(true);
    });

    // Expedition modal must show up cleanly again with no errors
    expect(screen.getByText(/Select Mining Expedition/i)).toBeDefined();
    expect(screen.getByText(/Single Player/i)).toBeDefined();
  });

  it('safely catches and absorbs mining_input rejections when session is inactive on server', async () => {
    // Import useMiningInput dynamically or test its hook directly
    const { renderHook } = await import('@testing-library/react');
    const { useMiningInput } = await import(
      '../src/views/MineView/components/MiningGrid/hooks/useMiningInput'
    );

    const rejectingSendGameEvent = vi.fn().mockRejectedValue(new Error('No active mining session.'));

    const { unmount } = renderHook(() =>
      useMiningInput({
        sendGameEvent: rejectingSendGameEvent,
        playerSpriteRef: { current: null },
        flashlightRef: { current: null },
        showDebugRef: { current: false },
        playerFacingDirRef: { current: { x: 1, y: 0 } },
        isFacingLeftRef: { current: false },
        zoom: 1.5,
      })
    );

    // Trigger keyboard movement which invokes sendGameEvent
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd' }));
    });

    expect(rejectingSendGameEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'mining_input' })
    );

    // Ensure no unhandled exception happened and cleanup succeeds
    unmount();
  });
});

