import { describe, it, expect, vi } from 'vitest';

vi.mock('../index', () => ({
  prisma: {
    item: {
      findFirst: vi.fn(),
    },
    inventoryItem: {
      findFirst: vi.fn(),
      delete: vi.fn(),
      update: vi.fn(),
    },
    character: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('../services/characterBroadcast', () => ({
  broadcastStatUpdate: vi.fn(),
}));

import { miningSessionManager } from '../services/mining/MiningSessionManager';
import { handleMiningPlaceTorch, handleMiningPlaceLadder } from './miningEvents';
import { prisma } from '../index';
import { MiningTileType } from '@mine-me/shared';

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

  it('closes multiplayer lobby session when all players leave, creating a fresh instance on next join', () => {
    // Player 1 and Player 2 join multiplayer lobby
    const sessionP1 = miningSessionManager.createSession('mp-p1', 'city-1', mockSocket, false, 0, 'multiplayer');
    const sessionP2 = miningSessionManager.createSession('mp-p2', 'city-1', mockSocket, false, 0, 'multiplayer');
    expect(sessionP1).toBe(sessionP2);
    expect(sessionP1.playerCount).toBe(2);

    // Player 1 leaves
    miningSessionManager.cancelSession('mp-p1');
    expect(sessionP1.playerCount).toBe(1);
    expect(miningSessionManager.getSession('mp-p2')).toBe(sessionP1);

    // Player 2 leaves -> room is now empty and should be cleaned up
    miningSessionManager.cancelSession('mp-p2');
    expect(sessionP1.playerCount).toBe(0);

    // Player 3 joins multiplayer lobby -> gets a brand new engine instance
    const sessionP3 = miningSessionManager.createSession('mp-p3', 'city-1', mockSocket, false, 0, 'multiplayer');
    expect(sessionP3).not.toBe(sessionP1);
    expect(sessionP3.playerCount).toBe(1);

    // Cleanup
    miningSessionManager.cancelSession('mp-p3');
  });

  it('joins existing multiplayer lobby even if forceNew is passed while another player is present', () => {
    const sessionP1 = miningSessionManager.createSession('mp-active-1', 'city-1', mockSocket, false, 0, 'multiplayer');
    expect(sessionP1.playerCount).toBe(1);

    // Player 2 joins with forceNew=true (e.g. from UI)
    const sessionP2 = miningSessionManager.createSession('mp-active-2', 'city-1', mockSocket, true, 0, 'multiplayer');
    expect(sessionP2).toBe(sessionP1);
    expect(sessionP1.playerCount).toBe(2);

    // Cleanup
    miningSessionManager.cancelSession('mp-active-1');
    miningSessionManager.cancelSession('mp-active-2');
  });
});

describe('handleMiningPlaceTorch', () => {
  const mockIo = {} as any;
  const mockSocket = {
    data: { characterId: 'char-torch-1' },
    connected: true,
    emit: vi.fn(),
  } as any;

  it('fails if no active session', async () => {
    const res = await handleMiningPlaceTorch(mockIo, mockSocket, { target: { x: 10, y: 5 } });
    expect(res.success).toBe(false);
    expect(res.error).toContain('No active mining session');
  });

  it('fails if character has no torch in inventory or temp backpack', async () => {
    const session = miningSessionManager.createSession('char-torch-1', 'city-1', mockSocket);
    (prisma.inventoryItem.findFirst as any).mockResolvedValue(null);

    const res = await handleMiningPlaceTorch(mockIo, mockSocket, { target: { x: 10, y: 5 } });
    expect(res.success).toBe(false);
    expect(res.error).toContain('do not have a torch');
  });

  it('places torch and deducts from inventory when character has torch', async () => {
    const session = miningSessionManager.createSession('char-torch-1', 'city-1', mockSocket);
    session.playerBody.position = { x: 10.5, y: 5.5 };
    session.grid[5][11] = { type: 0 as any, revealed: true };

    (prisma.inventoryItem.findFirst as any).mockResolvedValue({
      id: 'inv-torch-1',
      characterId: 'char-torch-1',
      quantity: 2,
      item: { id: 'torch-item-id', name: 'Torch', subType: 'TORCH' },
    });
    (prisma.character.findUnique as any).mockResolvedValue({
      id: 'char-torch-1',
      maxInventorySlots: 20,
      inventory: [],
    });

    const res = await handleMiningPlaceTorch(mockIo, mockSocket, { target: { x: 11, y: 5 } });
    expect(res.success).toBe(true);
    expect(prisma.inventoryItem.update).toHaveBeenCalledWith({
      where: { id: 'inv-torch-1' },
      data: { quantity: { decrement: 1 } },
    });
    expect(session.grid[5][11].type).toBe(MiningTileType.TORCH);
  });
});

describe('handleMiningPlaceLadder', () => {
  const mockIo = {} as any;
  const mockSocket = {
    data: { characterId: 'char-ladder-1' },
    connected: true,
    emit: vi.fn(),
  } as any;

  it('fails if no active session', async () => {
    const res = await handleMiningPlaceLadder(mockIo, mockSocket, { target: { x: 10, y: 5 } });
    expect(res.success).toBe(false);
    expect(res.error).toContain('No active mining session');
  });

  it('fails if character has no ladder in inventory', async () => {
    miningSessionManager.createSession('char-ladder-1', 'city-1', mockSocket);
    (prisma.inventoryItem.findFirst as any).mockResolvedValue(null);

    const res = await handleMiningPlaceLadder(mockIo, mockSocket, { target: { x: 10, y: 5 } });
    expect(res.success).toBe(false);
    expect(res.error).toContain('do not have a ladder');
  });

  it('places ladder and deducts from inventory when character has ladder', async () => {
    const session = miningSessionManager.createSession('char-ladder-1', 'city-1', mockSocket);
    session.playerBody.position = { x: 10.5, y: 5.5 };
    session.grid[5][11] = { type: MiningTileType.EMPTY, revealed: true };

    (prisma.inventoryItem.findFirst as any).mockResolvedValue({
      id: 'inv-ladder-1',
      characterId: 'char-ladder-1',
      quantity: 3,
      item: { id: 'ladder-item-id', name: 'Ladder', subType: 'LADDER' },
    });
    (prisma.character.findUnique as any).mockResolvedValue({
      id: 'char-ladder-1',
      maxInventorySlots: 20,
      inventory: [],
    });

    const res = await handleMiningPlaceLadder(mockIo, mockSocket, { target: { x: 11, y: 5 } });
    expect(res.success).toBe(true);
    expect(prisma.inventoryItem.update).toHaveBeenCalledWith({
      where: { id: 'inv-ladder-1' },
      data: { quantity: { decrement: 1 } },
    });
    expect(session.grid[5][11].type).toBe(MiningTileType.LADDER);
  });

  it('deletes inventory item if remaining quantity was 1', async () => {
    const session = miningSessionManager.createSession('char-ladder-1', 'city-1', mockSocket);
    session.playerBody.position = { x: 10.5, y: 5.5 };
    session.grid[5][11] = { type: MiningTileType.EMPTY, revealed: true };

    (prisma.inventoryItem.findFirst as any).mockResolvedValue({
      id: 'inv-ladder-last',
      characterId: 'char-ladder-1',
      quantity: 1,
      item: { id: 'ladder-item-id', name: 'Rope Ladder', subType: 'LADDER' },
    });
    (prisma.character.findUnique as any).mockResolvedValue({
      id: 'char-ladder-1',
      maxInventorySlots: 20,
      inventory: [],
    });

    const res = await handleMiningPlaceLadder(mockIo, mockSocket, { target: { x: 11, y: 5 } });
    expect(res.success).toBe(true);
    expect(prisma.inventoryItem.delete).toHaveBeenCalledWith({
      where: { id: 'inv-ladder-last' },
    });
    expect(session.grid[5][11].type).toBe(MiningTileType.LADDER);
  });
});

