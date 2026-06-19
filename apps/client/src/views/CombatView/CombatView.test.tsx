import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CombatView } from './CombatView';
import { useGame } from '../../contexts/GameContext';
import { useSocket } from '../../contexts/SocketContext';
import { useChat } from '../../contexts/ChatContext';
import { useNavigate } from 'react-router-dom';

// Mock hooks
vi.mock('../../contexts/GameContext', () => ({
  useGame: vi.fn(),
}));

vi.mock('../../contexts/SocketContext', () => ({
  useSocket: vi.fn(),
}));

vi.mock('../../contexts/ChatContext', () => ({
  useChat: vi.fn(),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: vi.fn(),
}));

const mockPlayAnimation = vi.fn((_key: string, options?: any) => {
  if (options?.onComplete) {
    options.onComplete();
  }
});
const mockHasAnimation = vi.fn(() => true);

// Mock SpriteRenderer and Sequencer
vi.mock('../../components/game/SpriteRenderer/SpriteRenderer', async () => {
  const React = await import('react');
  return {
    SpriteRenderer: React.forwardRef((_props: any, ref: any) => {
      React.useImperativeHandle(ref, () => ({
        showFloatingText: vi.fn(),
        getContainer: vi.fn(() => ({ x: 0, y: 0 })),
        getOriginPosition: vi.fn(() => ({ x: 0, y: 0 })),
        playAnimation: mockPlayAnimation,
        hasAnimation: mockHasAnimation,
      }));
      return React.createElement('div', { 'data-testid': 'sprite-renderer' });
    }),
  };
});

vi.mock('../../components/game/PixiStageContext/PixiStageContext', () => ({
  PixiStageProvider: ({ children }: any) => <div data-testid="pixi-stage-provider">{children}</div>,
}));

vi.mock('../../components/game/combat/CombatAnimationSequencer', () => {
  class MockSequencer {
    cancelled = false;
    playSequence = vi.fn(async (steps: any[]) => {
      this.cancelled = false;
      for (const step of steps) {
        if (this.cancelled) return;
        if (step.type === 'effect') {
          step.execute();
        } else if (step.type === 'callback') {
          await step.execute();
        }
      }
    });
    cancel = vi.fn(() => {
      this.cancelled = true;
    });
    isCancelled = vi.fn(() => this.cancelled);
  }
  return {
    CombatAnimationSequencer: MockSequencer,
    buildAttackSteps: vi.fn(() => []),
  };
});

describe('CombatView', () => {
  const mockNavigate = vi.fn();
  const mockSendGameEvent = vi.fn();
  const mockSetActiveTab = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (useNavigate as any).mockReturnValue(mockNavigate);
    (useSocket as any).mockReturnValue({ sendGameEvent: mockSendGameEvent });
    (useChat as any).mockReturnValue({ setActiveTab: mockSetActiveTab, addCombatLogs: vi.fn() });
    
    // Default mock implementation for useGame
    (useGame as any).mockReturnValue({
      battleState: {
        id: 'battle_1',
        status: 'IN_PROGRESS',
        playerHealth: 100,
        playerMaxHealth: 100,
        mobs: [{ id: 'mob_1', name: 'Goblin', health: 50, maxHealth: 50 }],
        round: 1,
        turn: 'PLAYER',
      },
      activeCharacter: { id: 'char_1' },
      playerState: { inventory: { items: [] } },
      setDisplayPlayerHealth: vi.fn(),
    });
  });

  it('renders combat state and mob name', () => {
    render(<CombatView />);
    expect(screen.getByText('Goblin')).toBeDefined();
    expect(screen.getByText('Round 1')).toBeDefined();
  });

  it('renders contextual buttons for VICTORY with more levels', () => {
    (useGame as any).mockReturnValue({
      battleState: {
        status: 'VICTORY',
        nextDungeonLevelId: 'dl_2',
        mobs: [],
      },
      activeCharacter: { id: 'char_1' },
      setDisplayPlayerHealth: vi.fn(),
    });

    render(<CombatView />);
    expect(screen.getByText('Victory!')).toBeDefined();
    expect(screen.getByText('Next Level')).toBeDefined();
    expect(screen.getByText('Back Out')).toBeDefined();
  });

  it('renders Finish Dungeon button for final VICTORY', () => {
    (useGame as any).mockReturnValue({
      battleState: {
        status: 'VICTORY',
        isDungeonComplete: true,
        mobs: [],
      },
      activeCharacter: { id: 'char_1' },
      setDisplayPlayerHealth: vi.fn(),
    });

    render(<CombatView />);
    expect(screen.getByText('Victory!')).toBeDefined();
    expect(screen.getByText('Finish Dungeon')).toBeDefined();
  });

  it('renders Back to City button on DEFEAT', () => {
    (useGame as any).mockReturnValue({
      battleState: {
        status: 'DEFEAT',
        mobs: [],
      },
      activeCharacter: { id: 'char_1' },
      setDisplayPlayerHealth: vi.fn(),
    });

    render(<CombatView />);
    expect(screen.getByText('Defeat!')).toBeDefined();
    expect(screen.getByText('Back to City')).toBeDefined();
  });

  it('calls advance_dungeon_level when Next Level is clicked', async () => {
    mockSendGameEvent.mockResolvedValue({ success: true });
    
    (useGame as any).mockReturnValue({
      battleState: {
        status: 'VICTORY',
        nextDungeonLevelId: 'dl_2',
        mobs: [],
      },
      activeCharacter: { id: 'char_1' },
      setDisplayPlayerHealth: vi.fn(),
    });

    render(<CombatView />);
    const nextBtn = screen.getByText('Next Level');
    fireEvent.click(nextBtn);

    expect(mockSendGameEvent).toHaveBeenCalledWith({ type: 'advance_dungeon_level' });
  });

  it('calls leave_combat when Finish Dungeon is clicked', async () => {
    mockSendGameEvent.mockResolvedValue({ success: true });
    
    (useGame as any).mockReturnValue({
      battleState: {
        status: 'VICTORY',
        isDungeonComplete: true,
        mobs: [],
      },
      activeCharacter: { id: 'char_1' },
      setDisplayPlayerHealth: vi.fn(),
    });

    render(<CombatView />);
    const finishBtn = screen.getByText('Finish Dungeon');
    fireEvent.click(finishBtn);

    expect(mockSendGameEvent).toHaveBeenCalledWith({ type: 'leave_combat' });
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/home');
    });
  });

  it('redirects to /home if battleState is null', () => {
    (useGame as any).mockReturnValue({
      battleState: null,
      activeCharacter: { id: 'char_1' },
      setDisplayPlayerHealth: vi.fn(),
    });

    render(<CombatView />);
    expect(mockNavigate).toHaveBeenCalledWith('/home');
  });

  it('plays death animation and sets faded class when a mob dies', async () => {
    const mockBattleState = {
      id: 'battle_1',
      status: 'IN_PROGRESS',
      playerHealth: 100,
      playerMaxHealth: 100,
      mobs: [{
        id: 'mob_1',
        name: 'Goblin',
        health: 50,
        maxHealth: 50,
        animations: { url: '/assets/goblin.png', atlasUrl: '/assets/goblin.json' }
      }],
      round: 1,
      turn: 'PLAYER',
      damageEvents: [] as any[],
      turnLogs: [] as any[],
    };

    const mockGameContext = {
      battleState: mockBattleState,
      activeCharacter: { id: 'char_1' },
      playerState: { inventory: { items: [] } },
      setDisplayPlayerHealth: vi.fn(),
    };

    (useGame as any).mockReturnValue(mockGameContext);

    const { rerender } = render(<CombatView />);

    // Update state to round 2 with a death event
    mockBattleState.round = 2;
    mockBattleState.mobs[0].health = 0;
    mockBattleState.damageEvents = [
      {
        sourceId: 'player',
        targetId: 'mob_1',
        type: 'damage',
        amount: 50,
      },
    ];
    mockBattleState.turnLogs = [
      { type: 'damage', content: 'Player deals 50 damage to Goblin.' }
    ];

    // Rerender with the new state
    rerender(<CombatView />);

    // Wait for playAnimation to be called with 'death'
    await waitFor(() => {
      expect(mockPlayAnimation).toHaveBeenCalledWith('death', expect.any(Object));
    });

    // Verify the mob's row has faded (has the opacity-0 class)
    const mobRow = screen.getByText('Goblin').closest('.transition-all.duration-1000');
    expect(mobRow?.className).toContain('opacity-0');
  });
});
