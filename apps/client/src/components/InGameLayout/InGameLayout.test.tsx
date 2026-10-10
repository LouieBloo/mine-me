import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { InGameLayout } from './InGameLayout';
import { GameProvider } from '../../contexts/GameContext';

let mockSession: { status: string; error: string | null } = { status: 'connecting', error: null };
const mockRetry = vi.fn();

vi.mock('../../contexts/SocketContext', () => ({
  useSocket: () => ({ session: mockSession, retrySession: mockRetry, onEvent: vi.fn(() => () => {}) }),
}));
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ user: { familyName: 'Test' } }) }));
vi.mock('../CharacterPanel/CharacterPanel', () => ({ CharacterPanel: () => <div>character-panel</div> }));
vi.mock('../InventoryPanel/InventoryPanel', () => ({ InventoryPanel: () => <div>inventory-panel</div> }));
vi.mock('../ChatPanel/ChatPanel', () => ({ ChatPanel: () => <div>chat-panel</div> }));
vi.mock('react-router-dom', async (orig) => ({
  ...(await orig<typeof import('react-router-dom')>()),
  Outlet: () => <div>outlet</div>,
}));

const character = {
  id: 'c1', name: 'Miner', class: 'Warrior', level: 1, sol: 0, lear: 0, stamina: 1, maxStamina: 1,
  combatScore: 1, defenseScore: 1, ageInDays: 1, cityId: 'city-1', status: 'ACTIVE', createdAt: '', inventory: [],
};

const tree = () => (
  <MemoryRouter>
    <GameProvider>
      <InGameLayout />
    </GameProvider>
  </MemoryRouter>
);

describe('InGameLayout session gate', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('nvg_active_character', JSON.stringify(character));
    mockRetry.mockClear();
  });

  it('shows the spinner instead of the game while the session is connecting', () => {
    mockSession = { status: 'connecting', error: null };
    render(tree());
    expect(screen.getByRole('status')).toBeTruthy();
    expect(screen.queryByText('outlet')).toBeNull();
  });

  it('shows the error with a retry button if setup fails before first ready', () => {
    mockSession = { status: 'error', error: 'boom' };
    render(tree());
    expect(screen.getByText('boom')).toBeTruthy();
    fireEvent.click(screen.getByText('Retry'));
    expect(mockRetry).toHaveBeenCalled();
  });

  it('renders the game once ready and keeps it mounted through a later reconnect', () => {
    mockSession = { status: 'ready', error: null };
    const { rerender } = render(tree());
    expect(screen.getByText('outlet')).toBeTruthy();

    mockSession = { status: 'connecting', error: null };
    act(() => { rerender(tree()); });
    expect(screen.getByText('outlet')).toBeTruthy();
    expect(screen.getByText('Reconnecting...')).toBeTruthy();
  });
});
