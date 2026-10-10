import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../index', () => ({
  prisma: {
    item: {
      findFirst: vi.fn(),
    },
    inventoryItem: {
      findFirst: vi.fn(),
      delete: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
      create: vi.fn(),
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
import {
  handleMiningPlaceTorch,
  handleMiningPlaceLadder,
  handleMiningThrowDynamite,
  handleMiningShoot,
  handleMiningReload,
} from './miningEvents';
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

beforeEach(() => {
  (prisma.inventoryItem.updateMany as any).mockReset().mockResolvedValue({ count: 1 });
  (prisma.inventoryItem.deleteMany as any).mockReset().mockResolvedValue({ count: 0 });
  (prisma.inventoryItem.create as any).mockReset();
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
    session.getPlayer('char-torch-1')!.playerBody.position = { x: 10.5, y: 5.5 };
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
    expect(prisma.inventoryItem.updateMany).toHaveBeenCalledWith({
      where: { id: 'inv-torch-1', characterId: 'char-torch-1', quantity: { gte: 1 } },
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
    session.getPlayer('char-ladder-1')!.playerBody.position = { x: 10.5, y: 5.5 };
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
    expect(prisma.inventoryItem.updateMany).toHaveBeenCalledWith({
      where: { id: 'inv-ladder-1', characterId: 'char-ladder-1', quantity: { gte: 1 } },
      data: { quantity: { decrement: 1 } },
    });
    expect(session.grid[5][11].type).toBe(MiningTileType.LADDER);
  });

  it('deletes inventory item if remaining quantity was 1', async () => {
    const session = miningSessionManager.createSession('char-ladder-1', 'city-1', mockSocket);
    session.getPlayer('char-ladder-1')!.playerBody.position = { x: 10.5, y: 5.5 };
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
    expect(prisma.inventoryItem.deleteMany).toHaveBeenCalledWith({
      where: { id: 'inv-ladder-last', characterId: 'char-ladder-1', quantity: { lte: 0 } },
    });
    expect(session.grid[5][11].type).toBe(MiningTileType.LADDER);
  });
});

describe('handleMiningThrowDynamite', () => {
  const mockIo = {} as any;
  const mockSocket = {
    connected: true,
    data: { characterId: 'char-dyn-1' },
    emit: vi.fn(),
  } as any;

  it('fails if character does not have dynamite in inventory', async () => {
    miningSessionManager.createSession('char-dyn-1', 'city-1', mockSocket);
    (prisma.inventoryItem.findFirst as any).mockResolvedValue(null);

    const res = await handleMiningThrowDynamite(mockIo, mockSocket, { target: { x: 15, y: 10 }, itemId: 'dyn-item-id' });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/do not have that throwable/i);
  });

  it('throws dynamite and decrements inventory when quantity > 1', async () => {
    const session = miningSessionManager.createSession('char-dyn-1', 'city-1', mockSocket);
    (prisma.inventoryItem.findFirst as any).mockResolvedValue({
      id: 'inv-dyn-1',
      characterId: 'char-dyn-1',
      quantity: 5,
      item: { id: 'dyn-item-id', name: 'Dynamite', subType: 'DYNAMITE', itemEffects: [] },
    });
    (prisma.character.findUnique as any).mockResolvedValue({
      id: 'char-dyn-1',
      maxInventorySlots: 20,
      inventory: [],
    });

    const res = await handleMiningThrowDynamite(mockIo, mockSocket, { target: { x: 12, y: 8 }, itemId: 'dyn-item-id' });
    expect(res.success).toBe(true);
    expect(prisma.inventoryItem.updateMany).toHaveBeenCalledWith({
      where: { id: 'inv-dyn-1', characterId: 'char-dyn-1', quantity: { gte: 1 } },
      data: { quantity: { decrement: 1 } },
    });
    expect(session.activeDynamites).toHaveLength(1);
    expect(session.activeDynamites[0].fuseRemainingSeconds).toBe(4.0);
  });

  it('deletes inventory entry if remaining dynamite quantity is 1', async () => {
    const session = miningSessionManager.createSession('char-dyn-1', 'city-1', mockSocket);
    (prisma.inventoryItem.findFirst as any).mockResolvedValue({
      id: 'inv-dyn-last',
      characterId: 'char-dyn-1',
      quantity: 1,
      item: { id: 'dyn-item-id', name: 'Dynamite', subType: 'DYNAMITE', itemEffects: [] },
    });
    (prisma.character.findUnique as any).mockResolvedValue({
      id: 'char-dyn-1',
      maxInventorySlots: 20,
      inventory: [],
    });

    const res = await handleMiningThrowDynamite(mockIo, mockSocket, { target: { x: 14, y: 6 }, itemId: 'dyn-item-id' });
    expect(res.success).toBe(true);
    expect(prisma.inventoryItem.deleteMany).toHaveBeenCalledWith({
      where: { id: 'inv-dyn-last', characterId: 'char-dyn-1', quantity: { lte: 0 } },
    });
    expect(session.activeDynamites.length).toBeGreaterThanOrEqual(1);
  });
});

describe('handleMiningShoot', () => {
  const mockIo = {} as any;
  const mockSocket = {
    connected: true,
    data: { characterId: 'char-shoot-1' },
    emit: vi.fn(),
  } as any;

  it('fails if no active session', async () => {
    const res = await handleMiningShoot(mockIo, mockSocket, { target: { x: 10, y: 10 } });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/no active mining session/i);
  });

  it('shoots projectile, decrements ammo, and returns remainingAmmo in data', async () => {
    const session = miningSessionManager.createSession('char-shoot-1', 'city-1', mockSocket);
    session.getPlayer('char-shoot-1')!.equippedWeaponId = 'cmn_revolver_6shooter';
    const res = await handleMiningShoot(mockIo, mockSocket, {
      target: { x: 25, y: 10 },
    });

    expect(res.success).toBe(true);
    expect(res.data).toBeDefined();
    expect(res.data?.remainingAmmo).toBe(5);
    expect(res.data?.isReloading).toBe(false);
    expect(session.activeProjectiles).toHaveLength(1);
  });
});

describe('handleMiningShoot — server-resolved weapon', () => {
  const mockIo = {} as any;
  const mockSocket = {
    connected: true,
    data: { characterId: 'char-shoot-2' },
    emit: vi.fn(),
  } as any;

  it('rejects the shot when no weapon is equipped, ignoring a client-supplied weapon id', async () => {
    const session = miningSessionManager.createSession('char-shoot-2', 'city-1', mockSocket, true);
    const res = await handleMiningShoot(mockIo, mockSocket, {
      target: { x: 25, y: 10 },
      weaponItemId: 'cmn_revolver_6shooter',
      itemId: 'cmn_revolver_6shooter',
    });
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/no ranged weapon/i);
    expect(session.activeProjectiles).toHaveLength(0);
  });

  it('rejects the shot when the equipped weapon does not shoot projectiles', async () => {
    const session = miningSessionManager.createSession('char-shoot-2', 'city-1', mockSocket, true);
    session.getPlayer('char-shoot-2')!.equippedWeaponId = 'definitely-not-an-item';
    const res = await handleMiningShoot(mockIo, mockSocket, { target: { x: 25, y: 10 } });
    expect(res.success).toBe(false);
    expect(session.activeProjectiles).toHaveLength(0);
  });

  it('uses the equipped weapon even if the client names a different one', async () => {
    const session = miningSessionManager.createSession('char-shoot-2', 'city-1', mockSocket, true);
    session.getPlayer('char-shoot-2')!.equippedWeaponId = 'cmn_revolver_6shooter';
    const res = await handleMiningShoot(mockIo, mockSocket, {
      target: { x: 25, y: 10 },
      weaponItemId: 'some-overpowered-gun',
    });
    expect(res.success).toBe(true);
    expect(session.activeProjectiles[0].weaponItemId).toBe('cmn_revolver_6shooter');
  });

  it('rejects malformed targets', async () => {
    miningSessionManager.createSession('char-shoot-2', 'city-1', mockSocket, true);
    const res = await handleMiningShoot(mockIo, mockSocket, { target: { x: NaN, y: 1 } as any });
    expect(res.success).toBe(false);
  });
});

describe('handleMiningReload', () => {
  const mockIo = {} as any;
  const mockSocket = {
    connected: true,
    data: { characterId: 'char-reload-1' },
    emit: vi.fn(),
  } as any;

  it('initiates weapon reload and returns status', async () => {
    const reloadEngine = miningSessionManager.createSession('char-reload-1', 'city-1', mockSocket);
    reloadEngine.getPlayer('char-reload-1')!.equippedWeaponId = 'cmn_revolver_6shooter';
    // Shoot once so ammo is 5/6
    await handleMiningShoot(mockIo, mockSocket, {
      target: { x: 25, y: 10 },
    });

    const res = await handleMiningReload(mockIo, mockSocket);
    expect(res.success).toBe(true);
    expect(res.data).toBeDefined();
    expect(res.data?.isReloading).toBe(true);
  });
});


