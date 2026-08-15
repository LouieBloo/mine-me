import { describe, it, expect, vi } from 'vitest';

vi.mock('../index', () => ({
  prisma: {
    item: {
      findFirst: vi.fn(),
    },
  },
}));

import { miningSessionManager } from '../services/mining/MiningSessionManager';

describe('MiningSessionManager', () => {
  const mockSocket = {
    connected: true,
    emit: vi.fn(),
  } as any;

  it('creates a session and reuses it on subsequent calls without forceNew', () => {
    const session1 = miningSessionManager.createSession('char-test-1', 'city-1', mockSocket);
    const session2 = miningSessionManager.createSession('char-test-1', 'city-1', mockSocket);
    expect(session1).toBe(session2);
  });

  it('stops and creates a fresh session when forceNew is true', () => {
    const session1 = miningSessionManager.createSession('char-test-2', 'city-1', mockSocket);
    const session2 = miningSessionManager.createSession('char-test-2', 'city-1', mockSocket, true);
    expect(session2).not.toBe(session1);
    expect(miningSessionManager.getSession('char-test-2')).toBe(session2);
  });

  it('cancels and terminates an active session on cancelSession', () => {
    const session = miningSessionManager.createSession('char-test-cancel', 'city-1', mockSocket);
    expect(miningSessionManager.getSession('char-test-cancel')).toBe(session);

    miningSessionManager.cancelSession('char-test-cancel');
    expect(miningSessionManager.getSession('char-test-cancel')).toBeUndefined();
    // Subsequent calls are safe no-ops
    expect(() => miningSessionManager.cancelSession('char-test-cancel')).not.toThrow();
  });
});

