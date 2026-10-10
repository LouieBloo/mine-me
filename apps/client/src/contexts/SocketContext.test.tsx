import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import { SocketProvider, useSocket, SESSION_MAX_ATTEMPTS } from './SocketContext';
import { GameProvider, useGame } from './GameContext';

type Handler = (...a: any[]) => void;
const handlers = new Map<string, Handler[]>();
const calls: string[] = [];

const mockService = vi.hoisted(() => ({
  instance: null as any,
  isConnected: true,
  connect: vi.fn(),
  disconnect: vi.fn(),
  selectCharacter: vi.fn(),
  joinCity: vi.fn(),
  leaveCity: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
}));

vi.mock('../services/socketService', () => {
  class SocketRequestError extends Error {
    serverRejected: boolean;
    constructor(message: string, serverRejected: boolean) {
      super(message);
      this.serverRejected = serverRejected;
    }
  }
  return { socketService: mockService, SocketRequestError };
});

const mockNotify = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock('../services/notificationService', () => ({ notificationService: mockNotify }));

const mockLogout = vi.fn();
vi.mock('../hooks/useAuth', () => ({ useAuth: () => ({ token: 'tok', logout: mockLogout }) }));

const character = {
  id: 'c1', name: 'Miner', class: 'Warrior', level: 1, sol: 0, lear: 0, stamina: 1, maxStamina: 1,
  combatScore: 1, defenseScore: 1, ageInDays: 1, cityId: 'city-1', status: 'ACTIVE', createdAt: '',
};

const fire = (event: string, ...a: any[]) => (handlers.get(event) ?? []).forEach((h) => h(...a));

const Probe = () => {
  const { session, retrySession } = useSocket();
  const { activeCharacter } = useGame();
  return (
    <div>
      <span data-testid="status">{session.status}</span>
      <span data-testid="error">{session.error ?? ''}</span>
      <span data-testid="char">{activeCharacter?.id ?? 'none'}</span>
      <button onClick={retrySession}>retry</button>
    </div>
  );
};

const renderSession = () =>
  render(
    <GameProvider>
      <SocketProvider>
        <Probe />
      </SocketProvider>
    </GameProvider>
  );

const status = () => screen.getByTestId('status').textContent;

describe('SocketProvider session', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handlers.clear();
    calls.length = 0;
    localStorage.clear();
    localStorage.setItem('nvg_active_character', JSON.stringify(character));

    mockService.instance = null;
    mockService.connect.mockResolvedValue(undefined);
    mockService.selectCharacter.mockImplementation(async () => { calls.push('select'); });
    mockService.joinCity.mockImplementation(async (city: string) => { calls.push(`join:${city}`); });
    mockService.leaveCity.mockResolvedValue(undefined);
    mockService.on.mockImplementation((event: string, h: Handler) => {
      handlers.set(event, [...(handlers.get(event) ?? []), h]);
    });
    mockService.off.mockImplementation((event: string, h: Handler) => {
      handlers.set(event, (handlers.get(event) ?? []).filter((x) => x !== h));
    });
  });

  it('selects the character, then joins its city, then is ready', async () => {
    renderSession();
    await waitFor(() => expect(status()).toBe('ready'));
    expect(calls).toEqual(['select', 'join:city-1']);
  });

  it('does not touch the server until the socket is connected', async () => {
    let connect: () => void = () => {};
    mockService.connect.mockReturnValue(new Promise<void>((r) => { connect = r; }));
    renderSession();
    expect(status()).toBe('connecting');
    expect(mockService.selectCharacter).not.toHaveBeenCalled();

    await act(async () => { connect(); });
    await waitFor(() => expect(status()).toBe('ready'));
  });

  it('retries a transient failure and still becomes ready', async () => {
    mockService.selectCharacter
      .mockRejectedValueOnce(new Error('select_character timed out'))
      .mockImplementation(async () => { calls.push('select'); });
    renderSession();
    await waitFor(() => expect(status()).toBe('ready'), { timeout: 4000 });
    expect(mockService.selectCharacter).toHaveBeenCalledTimes(2);
  });

  it('shows an error after the attempts run out and recovers on retry', async () => {
    mockService.selectCharacter.mockRejectedValue(new Error('boom'));
    renderSession();
    await waitFor(() => expect(status()).toBe('error'), { timeout: 8000 });
    expect(screen.getByTestId('error').textContent).toBe('boom');
    expect(mockService.selectCharacter).toHaveBeenCalledTimes(SESSION_MAX_ATTEMPTS);

    mockService.selectCharacter.mockImplementation(async () => { calls.push('select'); });
    await act(async () => { screen.getByText('retry').click(); });
    await waitFor(() => expect(status()).toBe('ready'));
  }, 15000);

  it('sends the user back to character selection when the server rejects the character', async () => {
    const { SocketRequestError } = await import('../services/socketService');
    mockService.selectCharacter.mockRejectedValue(new SocketRequestError('Character not found or forbidden', true));
    renderSession();
    await waitFor(() => expect(screen.getByTestId('char').textContent).toBe('none'));
    expect(mockNotify.error).toHaveBeenCalled();
    expect(mockService.selectCharacter).toHaveBeenCalledTimes(1); // no pointless retries
  });

  it('sets the session up again after a reconnect', async () => {
    renderSession();
    await waitFor(() => expect(status()).toBe('ready'));
    expect(calls).toEqual(['select', 'join:city-1']);

    await act(async () => { fire('disconnect'); });
    await act(async () => { fire('connect'); });
    await waitFor(() => expect(calls).toEqual(['select', 'join:city-1', 'select', 'join:city-1']));
    await waitFor(() => expect(status()).toBe('ready'));
  });

  it('signs out when the server rejects the credentials', async () => {
    mockService.connect.mockRejectedValue(new Error('Authentication error: Invalid or expired token'));
    renderSession();
    await waitFor(() => expect(mockLogout).toHaveBeenCalled());
  });
});
