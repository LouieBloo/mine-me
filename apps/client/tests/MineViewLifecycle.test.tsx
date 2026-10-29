import { MINING_CONFIG } from '@mine-me/shared';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React, { useState } from 'react';
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { notificationService } from '../src/services/notificationService';
import { soundManager } from '../src/services/sound';
import { MineView } from '../src/views/MineView/MineView';
import { GameProvider, useGame } from '../src/contexts/GameContext';

// Mock sub-components that use Pixi or complex DOM
vi.mock('../src/views/MineView/components/MiningGrid/MiningGrid', () => ({
  MiningGrid: () => <div data-testid="mining-grid">Mining Grid</div>,
}));

vi.mock('../src/views/MineView/components/MiningHUD/MiningHUD', () => ({
  MiningHUD: ({ onExit }: any) => (
    <div data-testid="mining-hud">
      Mining HUD
      <button onClick={onExit}>exit-now</button>
    </div>
  ),
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

/** Answers the events a start sends: no missions on offer, and the given state for the run itself. */
const answerStart = (sessionState: Record<string, unknown>, missions: unknown = { offers: [] }) =>
  mockSendGameEvent.mockImplementation(async (event: { type: string }) => {
    if (event.type === 'mining_mission_offers') return { success: true, data: missions };
    if (event.type === 'mining_start') return { success: true, data: { sessionState } };
    return { success: true };
  });

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

// (a stable function, like the real hook's: the biome picker reloads whenever it changes)
const fetchWithAuth = () => Promise.resolve({ ok: true, json: () => Promise.resolve([]) });
vi.mock('../src/hooks/useApi', () => ({
  useApi: () => ({ fetchWithAuth }),
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
  id: mockActiveCharacter.id,
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
    answerStart({
      grid: [],
      position: { x: 15, y: 0 },
      droppedItems: [],
      temporaryBackpack: [],
      visionRange: 3,
      canExtract: true,
      isMining: false,
    });

    const soloButton = screen.getByText(/Single Player/i);
    await act(async () => {
      soloButton.click();
    });
    // Single Player has a biome step; a normal run just starts
    await act(async () => {
      screen.getByRole('button', { name: 'Start Expedition' }).click();
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

  describe('server-ended runs', () => {
    const startSession = async (handlers: Record<string, (p: any) => void>) => {
      mockOnEvent.mockImplementation((name: string, handler: (p: any) => void) => {
        handlers[name] = handler;
        return () => {};
      });
      let session: any = 'uninitialized';
      let path = '';
      const Probe = () => {
        session = useGame().miningSession;
        path = useLocation().pathname;
        return null;
      };
      render(
        <MemoryRouter initialEntries={['/mine']}>
          <GameProvider>
            <Probe />
            <MineView />
          </GameProvider>
        </MemoryRouter>
      );
      answerStart({
        grid: [], position: { x: 15, y: 0 }, droppedItems: [], temporaryBackpack: [],
        visionRange: 3, canExtract: true, isMining: false,
      });
      await act(async () => {
        screen.getByText(/Single Player/i).click();
      });
      await act(async () => {
        screen.getByRole('button', { name: 'Start Expedition' }).click();
      });
      expect(session).not.toBeNull();
      return { getSession: () => session, getPath: () => path };
    };

    it('shows an error and returns home when the player dies (mining_session_ended)', async () => {
      const errorSpy = vi.spyOn(notificationService, 'error').mockImplementation(() => undefined as any);
      const handlers: Record<string, (p: any) => void> = {};
      const { getSession, getPath } = await startSession(handlers);

      await act(async () => {
        handlers['mining_session_ended']({ reason: 'death', title: 'You Were Knocked Out', message: 'Backpack lost.' });
      });

      expect(errorSpy).toHaveBeenCalledWith('You Were Knocked Out', 'Backpack lost.');
      expect(getSession()).toBeNull();
      expect(getPath()).toBe('/home');
      // The server already ended the run, so unmounting must not send a second cancel
      mockSendGameEvent.mockClear();
    });

    it('shows a toast when the server says the tool is too weak, without ending the run', async () => {
      const infoSpy = vi.spyOn(notificationService, 'info').mockImplementation(() => undefined as any);
      const handlers: Record<string, (p: any) => void> = {};
      const { getSession, getPath } = await startSession(handlers);

      await act(async () => {
        handlers['mining_notice']({ kind: 'tool_too_weak', message: "Your tool isn't strong enough to break Silverium." });
      });

      expect(infoSpy).toHaveBeenCalledWith('Tool Too Weak', "Your tool isn't strong enough to break Silverium.");
      expect(getSession()).not.toBeNull();
      expect(getPath()).toBe('/mine');
    });

    it('still handles the 15 minute timeout the same way', async () => {
      const infoSpy = vi.spyOn(notificationService, 'info').mockImplementation(() => undefined as any);
      const handlers: Record<string, (p: any) => void> = {};
      const { getSession, getPath } = await startSession(handlers);

      await act(async () => {
        handlers['mining_session_timeout']({ message: 'Out of time.' });
      });

      expect(infoSpy).toHaveBeenCalledWith('Time Limit Reached', 'Out of time.');
      expect(getSession()).toBeNull();
      expect(getPath()).toBe('/home');
    });
  });

  describe('missions (tickets 111-113)', () => {
    const missionState = {
      id: 'm1', name: 'Copper Run', tier: 1, completed: false, reward: { coins: 30, xp: 20, items: [] },
      objectives: [{ type: 'KILL_MOB', label: 'Kill 3 mobs', target: 3, progress: 0, done: false, unit: 'count' }],
    };
    const runState = (over: Record<string, unknown> = {}) => ({
      grid: [], position: { x: 15, y: 0 }, droppedItems: [], temporaryBackpack: [], visionRange: 3, canExtract: true, isMining: false, ...over,
    });
    const offers = [{ id: 'm1', name: 'Copper Run', description: null, tier: 1, objectives: [{ type: 'KILL_MOB', label: 'Kill 3 mobs', target: 3, unit: 'count' }], reward: { coins: 30, xp: 20, items: [] } }];

    const mount = (handlers: Record<string, (p: any) => void>) => {
      mockOnEvent.mockImplementation((name: string, handler: (p: any) => void) => {
        handlers[name] = handler;
        return () => {};
      });
      let session: any = 'uninitialized';
      let path = '';
      const Probe = () => {
        session = useGame().miningSession;
        path = useLocation().pathname;
        return null;
      };
      render(
        <MemoryRouter initialEntries={['/mine']}>
          <GameProvider>
            <Probe />
            <MineView />
          </GameProvider>
        </MemoryRouter>
      );
      return { getSession: () => session, getPath: () => path };
    };

    it('offers the missions before the run starts and sends the picked one with the start', async () => {
      answerStart(runState({ mission: missionState }), { offers });
      const { getSession } = mount({});
      await act(async () => {
        screen.getByText(/Single Player/i).click();
      });
      await act(async () => {
        screen.getByRole('button', { name: 'Start Expedition' }).click();
      });
      expect(mockSendGameEvent).toHaveBeenCalledWith({ type: 'mining_mission_offers', mode: 'singleplayer' });
      expect(mockSendGameEvent).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'mining_start' }));
      await act(async () => {
        screen.getByText('Copper Run').click();
      });
      await act(async () => {
        screen.getByRole('button', { name: 'Start Mission' }).click();
      });
      expect(mockSendGameEvent).toHaveBeenCalledWith({ type: 'mining_start', mode: 'singleplayer', forceNew: true, missionId: 'm1' });
      expect(getSession().mission).toMatchObject({ name: 'Copper Run' });
    });

    it('follows the mission in the tick and replaces it when the server sends a whole new state', async () => {
      const handlers: Record<string, (p: any) => void> = {};
      answerStart(runState({ mission: missionState }));
      const { getSession } = mount(handlers);
      await act(async () => {
        screen.getByText(/Single Player/i).click();
      });
      await act(async () => {
        screen.getByRole('button', { name: 'Start Expedition' }).click();
      });
      expect(getSession().mission.objectives[0].progress).toBe(0);
      await act(async () => {
        handlers['mining_state_tick']({ missionProgress: { objectives: [{ index: 0, progress: 2, done: false }] } });
      });
      expect(getSession().mission.objectives[0].progress).toBe(2);
      await act(async () => {
        handlers['mining_mission_state']({ mission: null });
      });
      expect(getSession().mission).toBeUndefined();
    });

    it('shows the paid mission first on a safe exit, then the spoils', async () => {
      const handlers: Record<string, (p: any) => void> = {};
      mockSendGameEvent.mockImplementation(async (event: { type: string }) => {
        if (event.type === 'mining_mission_offers') return { success: true, data: { offers: [] } };
        if (event.type === 'mining_start') return { success: true, data: { sessionState: runState({ mission: missionState }) } };
        if (event.type === 'mining_exit') {
          return {
            success: true,
            data: {
              extractedItems: [{ itemId: 'i1', itemName: 'Copperium', iconUrl: null, quantity: 4 }],
              mission: { name: 'Copper Run', tier: 1, outcome: 'paid', objectives: missionState.objectives.map((o) => ({ ...o, done: true, progress: 3 })), contributions: [], reward: { coins: 30, xp: 20, items: [] } },
            },
          };
        }
        return { success: true };
      });
      const { getPath } = mount(handlers);
      await act(async () => {
        screen.getByText(/Single Player/i).click();
      });
      await act(async () => {
        screen.getByRole('button', { name: 'Start Expedition' }).click();
      });
      await act(async () => {
        screen.getByText('exit-now').click();
      });
      expect(screen.getByTestId('mission-reward').textContent).toContain('30 coins, 20 XP');
      expect(screen.queryByText(/Expedition Summary/)).toBeNull();
      await act(async () => {
        screen.getByRole('button', { name: 'Continue' }).click();
      });
      expect(screen.getByText(/Expedition Summary/)).toBeDefined();
      expect(getPath()).toBe('/mine');
    });

    it('shows the lost mission before going home when the run ends in death, with the mission\'s own failed sound', async () => {
      const playSfx = vi.spyOn(soundManager, 'playSfx').mockImplementation(() => null);
      const handlers: Record<string, (p: any) => void> = {};
      answerStart(runState({ mission: { ...missionState, sounds: { failed: { url: '/assets/sounds/fail.mp3', volume: 0.4 } } } }));
      const { getPath } = mount(handlers);
      await act(async () => {
        screen.getByText(/Single Player/i).click();
      });
      await act(async () => {
        screen.getByRole('button', { name: 'Start Expedition' }).click();
      });
      await act(async () => {
        handlers['mining_session_ended']({
          reason: 'death', title: 'You Were Knocked Out', message: 'Backpack lost.',
          mission: { name: 'Copper Run', tier: 1, outcome: 'failed', objectives: missionState.objectives, contributions: [], reason: 'You were knocked out before you reached the exit.' },
        });
      });
      expect(screen.getByText(/Mission Failed/)).toBeDefined();
      expect(screen.getByText(/knocked out before you reached the exit/)).toBeDefined();
      expect(playSfx).toHaveBeenCalledWith('/assets/sounds/fail.mp3', expect.objectContaining({ volumeScale: 0.4 }));
      expect(getPath()).toBe('/mine');
      await act(async () => {
        screen.getByRole('button', { name: 'Continue' }).click();
      });
      expect(getPath()).toBe('/home');
    });
  });

  describe('sandbox', () => {
    const sandboxState = (over: Record<string, unknown> = {}) => ({
      grid: [], position: { x: MINING_CONFIG.ENTRANCE_X, y: 0 }, droppedItems: [], temporaryBackpack: [], visionRange: 3,
      canExtract: false, isMining: false, gameMode: 'sandbox',
      fluids: [{ typeKey: 'OIL', name: 'Oil' }],
      gases: [{ typeKey: 'HYDROGEN', name: 'Hydrogen' }, { typeKey: 'NITROGEN', name: 'Nitrogen' }],
      sandbox: { mobs: [{ id: 'm1', name: 'Mole Person' }], status: { godMode: false, paused: false, speed: 1 } },
      ...over,
    });

    const enterSandbox = async (handlers: Record<string, (p: any) => void> = {}) => {
      mockOnEvent.mockImplementation((name: string, handler: (p: any) => void) => {
        handlers[name] = handler;
        return () => {};
      });
      let session: any = 'uninitialized';
      let path = '';
      const Probe = () => {
        session = useGame().miningSession;
        path = useLocation().pathname;
        return null;
      };
      render(
        <MemoryRouter initialEntries={['/mine']}>
          <GameProvider>
            <Probe />
            <MineView />
          </GameProvider>
        </MemoryRouter>
      );
      mockSendGameEvent.mockResolvedValueOnce({ success: true, data: { sessionState: sandboxState() } });
      await act(async () => {
        screen.getByText('Sandbox').click();
      });
      return { getSession: () => session, getPath: () => path };
    };

    it('starts the shared sandbox without restarting an existing room', async () => {
      await enterSandbox();
      expect(mockSendGameEvent).toHaveBeenCalledWith({ type: 'mining_start', mode: 'sandbox', forceNew: false });
    });

    it('shows the tool panel with the loaded fluids and mobs', async () => {
      await enterSandbox();
      expect(screen.getByText('Reset sandbox')).toBeDefined();
      expect(screen.getByRole('option', { name: 'Oil' })).toBeDefined();
      expect(screen.getByRole('option', { name: 'Mole Person' })).toBeDefined();
    });

    it('lists the loaded gases in the panel so they can be released', async () => {
      await enterSandbox();
      expect(screen.getByRole('option', { name: 'Hydrogen' })).toBeDefined();
      expect(screen.getByRole('option', { name: 'Nitrogen' })).toBeDefined();
      expect(screen.getByText('Release gas')).toBeDefined();
    });

    it('does not show the tool panel in a normal mine', async () => {
      mockOnEvent.mockReturnValue(() => {});
      render(
        <MemoryRouter initialEntries={['/mine']}>
          <GameProvider>
            <MineView />
          </GameProvider>
        </MemoryRouter>
      );
      mockSendGameEvent.mockResolvedValueOnce({
        success: true,
        data: { sessionState: { grid: [], position: { x: MINING_CONFIG.ENTRANCE_X, y: 0 }, droppedItems: [], temporaryBackpack: [], visionRange: 3, canExtract: true, isMining: false, gameMode: 'singleplayer' } },
      });
      await act(async () => {
        screen.getByText(/Single Player/i).click();
      });
      await act(async () => {
        screen.getByRole('button', { name: 'Start Expedition' }).click();
      });
      expect(screen.queryByText('Reset sandbox')).toBeNull();
    });

    it('leaves straight to town, with no loot summary, when Leave sandbox is pressed', async () => {
      const { getSession, getPath } = await enterSandbox();
      mockSendGameEvent.mockResolvedValueOnce({ success: true, data: { extractedItems: [] } });
      await act(async () => {
        screen.getByText('Leave sandbox').click();
      });
      expect(mockSendGameEvent).toHaveBeenCalledWith({ type: 'mining_exit' });
      expect(getSession()).toBeNull();
      expect(getPath()).toBe('/home');
      expect(screen.queryByText(/Expedition Summary/i)).toBeNull();
    });

    it('never asks "Leave Mine?" when the player walks back to the spawn', async () => {
      let setSession: (fn: (prev: any) => any) => void = () => {};
      const Mover = () => {
        setSession = useGame().setMiningSession as any;
        return null;
      };
      mockOnEvent.mockReturnValue(() => {});
      render(
        <MemoryRouter initialEntries={['/mine']}>
          <GameProvider>
            <Mover />
            <MineView />
          </GameProvider>
        </MemoryRouter>
      );
      mockSendGameEvent.mockResolvedValueOnce({ success: true, data: { sessionState: sandboxState() } });
      await act(async () => {
        screen.getByText('Sandbox').click();
      });
      // Off the entrance, then back on it: a normal mine would offer to extract here
      await act(async () => setSession((prev) => ({ ...prev, position: { x: 30, y: 8 } })));
      await act(async () => setSession((prev) => ({ ...prev, position: { x: MINING_CONFIG.ENTRANCE_X, y: 0 } })));
      expect(screen.queryByText(/Leave Mine\?/)).toBeNull();
    });

    it('does ask in a normal mine (control for the test above)', async () => {
      let setSession: (fn: (prev: any) => any) => void = () => {};
      const Mover = () => {
        setSession = useGame().setMiningSession as any;
        return null;
      };
      mockOnEvent.mockReturnValue(() => {});
      render(
        <MemoryRouter initialEntries={['/mine']}>
          <GameProvider>
            <Mover />
            <MineView />
          </GameProvider>
        </MemoryRouter>
      );
      mockSendGameEvent.mockResolvedValueOnce({
        success: true,
        data: { sessionState: { grid: [], position: { x: MINING_CONFIG.ENTRANCE_X, y: 0 }, droppedItems: [], temporaryBackpack: [], visionRange: 3, canExtract: true, isMining: false, gameMode: 'singleplayer' } },
      });
      await act(async () => {
        screen.getByText(/Single Player/i).click();
      });
      await act(async () => {
        screen.getByRole('button', { name: 'Start Expedition' }).click();
      });
      await act(async () => setSession((prev) => ({ ...prev, position: { x: 30, y: 8 } })));
      await act(async () => setSession((prev) => ({ ...prev, position: { x: MINING_CONFIG.ENTRANCE_X, y: 0 } })));
      expect(screen.getByText(/Leave Mine\?/)).toBeDefined();
    });

    it('rebuilds the session and tells the user when the sandbox is reset', async () => {
      const infoSpy = vi.spyOn(notificationService, 'info').mockImplementation(() => undefined as any);
      const handlers: Record<string, (p: any) => void> = {};
      const { getSession } = await enterSandbox(handlers);
      const fresh = sandboxState({ position: { x: MINING_CONFIG.ENTRANCE_X, y: 0 }, visionRange: 7 });

      await act(async () => {
        handlers['mining_sandbox_reset']({ sessionState: fresh });
      });

      expect(getSession().visionRange).toBe(7);
      expect(infoSpy).toHaveBeenCalledWith('Sandbox reset', expect.any(String));
    });

    it('ignores a reset event with no state', async () => {
      const handlers: Record<string, (p: any) => void> = {};
      const { getSession } = await enterSandbox(handlers);
      const before = getSession();
      await act(async () => {
        handlers['mining_sandbox_reset']({});
      });
      expect(getSession()).toBe(before);
    });

    it('sends reset from the panel', async () => {
      await enterSandbox();
      mockSendGameEvent.mockResolvedValueOnce({ success: true });
      await act(async () => {
        screen.getByText('Reset sandbox').click();
      });
      expect(mockSendGameEvent).toHaveBeenCalledWith({ type: 'sandbox_reset' });
    });
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
        world: {
          playerSpriteRef: { current: null },
          flashlightRef: { current: null },
          showDebugRef: { current: false },
          playerFacingDirRef: { current: { x: 1, y: 0 } },
          isFacingLeftRef: { current: false },
          mouseControllerRef: { current: null as never },
        },
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

