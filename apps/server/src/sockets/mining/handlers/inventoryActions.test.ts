import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../index', () => ({
  prisma: {
    inventoryItem: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
      create: vi.fn(),
    },
    character: { findUnique: vi.fn() },
  },
}));
vi.mock('../../../services/characterBroadcast', () => ({ broadcastStatUpdate: vi.fn() }));

import { prisma } from '../../../index';
import { broadcastStatUpdate } from '../../../services/characterBroadcast';
import { miningSessionManager } from '../../../services/mining/MiningSessionManager';
import { MiningTileType } from '@mine-me/shared';
import { consumeInventoryItem, refundInventoryItem, broadcastInventory } from './inventoryActions';
import { handleMiningPlaceLadder, handleMiningPlaceTorch } from './placementHandlers';
import { handleMiningThrowDynamite } from './combatHandlers';

const inv = prisma.inventoryItem as any;

beforeEach(() => {
  vi.clearAllMocks();
  inv.updateMany.mockResolvedValue({ count: 1 });
  inv.deleteMany.mockResolvedValue({ count: 0 });
  (prisma.character.findUnique as any).mockResolvedValue({ id: 'x', maxInventorySlots: 20, inventory: [] });
});

describe('consumeInventoryItem', () => {
  it('decrements only when enough quantity exists and clears empty rows', async () => {
    expect(await consumeInventoryItem('c1', 'row1', 2)).toBe(true);
    expect(inv.updateMany).toHaveBeenCalledWith({
      where: { id: 'row1', characterId: 'c1', quantity: { gte: 2 } },
      data: { quantity: { decrement: 2 } },
    });
    expect(inv.deleteMany).toHaveBeenCalledWith({ where: { id: 'row1', characterId: 'c1', quantity: { lte: 0 } } });
  });

  it('returns false and deletes nothing when the guarded update matches no row', async () => {
    inv.updateMany.mockResolvedValue({ count: 0 });
    expect(await consumeInventoryItem('c1', 'row1')).toBe(false);
    expect(inv.deleteMany).not.toHaveBeenCalled();
  });

  it('two concurrent consumes of the last item: exactly one succeeds', async () => {
    let remaining = 1;
    inv.updateMany.mockImplementation(async () => {
      await Promise.resolve();
      if (remaining >= 1) {
        remaining--;
        return { count: 1 };
      }
      return { count: 0 };
    });
    const results = await Promise.all([consumeInventoryItem('c1', 'row1'), consumeInventoryItem('c1', 'row1')]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });
});

describe('refundInventoryItem', () => {
  it('increments an existing row', async () => {
    await refundInventoryItem('c1', 'item1');
    expect(inv.updateMany).toHaveBeenCalledWith({
      where: { characterId: 'c1', itemId: 'item1' },
      data: { quantity: { increment: 1 } },
    });
    expect(inv.create).not.toHaveBeenCalled();
  });

  it('recreates the row if it was deleted', async () => {
    inv.updateMany.mockResolvedValue({ count: 0 });
    await refundInventoryItem('c1', 'item1', 1);
    expect(inv.create).toHaveBeenCalledWith({ data: { characterId: 'c1', itemId: 'item1', quantity: 1 } });
  });
});

describe('broadcastInventory', () => {
  it('reloads the character and broadcasts the mapped inventory', async () => {
    await broadcastInventory('c1');
    expect(broadcastStatUpdate).toHaveBeenCalledWith('c1', expect.objectContaining({ inventory: expect.anything() }));
  });
});

describe('handlers: race & failure behaviour', () => {
  const io = {} as any;
  const mkSocket = (id: string) => ({ data: { characterId: id }, connected: true, emit: vi.fn() }) as any;

  it('ladder: does not place when the last item was consumed by a concurrent request', async () => {
    const socket = mkSocket('race-ladder');
    const engine = miningSessionManager.createSession('race-ladder', 'city', socket, true);
    engine.getPlayer('race-ladder')!.playerBody.position = { x: 10.5, y: 5.5 };
    engine.grid[5][11] = { type: MiningTileType.EMPTY, revealed: true };
    inv.findFirst.mockResolvedValue({ id: 'row', itemId: 'ladder-id', quantity: 1, item: { subType: 'LADDER' } });
    inv.updateMany.mockResolvedValue({ count: 0 });

    const res = await handleMiningPlaceLadder(io, socket, { target: { x: 11, y: 5 } });

    expect(res.success).toBe(false);
    expect(engine.grid[5][11].type).toBe(MiningTileType.EMPTY);
    miningSessionManager.cancelSession('race-ladder');
  });

  it('ladder: does not consume anything when placement is invalid', async () => {
    const socket = mkSocket('invalid-ladder');
    const engine = miningSessionManager.createSession('invalid-ladder', 'city', socket, true);
    engine.getPlayer('invalid-ladder')!.playerBody.position = { x: 10.5, y: 5.5 };
    inv.findFirst.mockResolvedValue({ id: 'row', itemId: 'ladder-id', quantity: 1, item: { subType: 'LADDER' } });

    // Far outside reach
    const res = await handleMiningPlaceLadder(io, socket, { target: { x: 40, y: 40 } });

    expect(res.success).toBe(false);
    expect(inv.updateMany).not.toHaveBeenCalled();
    miningSessionManager.cancelSession('invalid-ladder');
  });

  it('torch: refunds the item if the commit is refused after consuming', async () => {
    const socket = mkSocket('refund-torch');
    const engine = miningSessionManager.createSession('refund-torch', 'city', socket, true);
    engine.getPlayer('refund-torch')!.playerBody.position = { x: 10.5, y: 5.5 };
    engine.grid[5][11] = { type: MiningTileType.EMPTY, revealed: true };
    inv.findFirst.mockResolvedValue({ id: 'row', itemId: 'torch-id', quantity: 1, item: { subType: 'TORCH' } });
    vi.spyOn(engine, 'placeTorch').mockReturnValue(false);

    const res = await handleMiningPlaceTorch(io, socket, { target: { x: 11, y: 5 } });

    expect(res.success).toBe(false);
    expect(inv.updateMany).toHaveBeenCalledWith({
      where: { characterId: 'refund-torch', itemId: 'torch-id' },
      data: { quantity: { increment: 1 } },
    });
    miningSessionManager.cancelSession('refund-torch');
  });

  it('torch: rejects malformed targets before touching the DB', async () => {
    const socket = mkSocket('bad-torch');
    miningSessionManager.createSession('bad-torch', 'city', socket, true);
    const res = await handleMiningPlaceTorch(io, socket, { target: { x: 1.5, y: 2 } });
    expect(res.success).toBe(false);
    expect(inv.findFirst).not.toHaveBeenCalled();
    miningSessionManager.cancelSession('bad-torch');
  });

  describe('throw', () => {
    it('requires an itemId', async () => {
      const socket = mkSocket('throw-noid');
      miningSessionManager.createSession('throw-noid', 'city', socket, true);
      const res = await handleMiningThrowDynamite(io, socket, { target: { x: 5, y: 5 } });
      expect(res).toEqual({ success: false, error: 'No throwable item specified.' });
      expect(inv.findFirst).not.toHaveBeenCalled();
      miningSessionManager.cancelSession('throw-noid');
    });

    it('only looks up the specified item and requires it to be throwable', async () => {
      const socket = mkSocket('throw-q');
      miningSessionManager.createSession('throw-q', 'city', socket, true);
      inv.findFirst.mockResolvedValue(null);
      const res = await handleMiningThrowDynamite(io, socket, { target: { x: 5, y: 5 }, itemId: 'sword-id' });
      expect(res.success).toBe(false);
      const where = inv.findFirst.mock.calls[0][0].where;
      expect(where.itemId).toBe('sword-id');
      expect(where.item.OR).toEqual(expect.arrayContaining([{ throwable: true }]));
      miningSessionManager.cancelSession('throw-q');
    });

    it('does not spawn a dynamite when a concurrent request consumed the last one', async () => {
      const socket = mkSocket('throw-race');
      const engine = miningSessionManager.createSession('throw-race', 'city', socket, true);
      inv.findFirst.mockResolvedValue({ id: 'row', itemId: 'dyn', quantity: 1, item: { id: 'dyn', subType: 'DYNAMITE' } });
      inv.updateMany.mockResolvedValue({ count: 0 });

      const res = await handleMiningThrowDynamite(io, socket, { target: { x: 5, y: 5 }, itemId: 'dyn' });

      expect(res.success).toBe(false);
      expect(engine.activeDynamites).toHaveLength(0);
      miningSessionManager.cancelSession('throw-race');
    });

    it('refunds when the engine fails to launch', async () => {
      const socket = mkSocket('throw-refund');
      const engine = miningSessionManager.createSession('throw-refund', 'city', socket, true);
      inv.findFirst.mockResolvedValue({ id: 'row', itemId: 'dyn', quantity: 1, item: { id: 'dyn', subType: 'DYNAMITE' } });
      vi.spyOn(engine, 'throwDynamite').mockReturnValue(false);

      const res = await handleMiningThrowDynamite(io, socket, { target: { x: 5, y: 5 }, itemId: 'dyn' });

      expect(res.success).toBe(false);
      expect(inv.updateMany).toHaveBeenLastCalledWith({
        where: { characterId: 'throw-refund', itemId: 'dyn' },
        data: { quantity: { increment: 1 } },
      });
      miningSessionManager.cancelSession('throw-refund');
    });

    it('clamps forceRatio and ignores non-finite values', async () => {
      const socket = mkSocket('throw-force');
      const engine = miningSessionManager.createSession('throw-force', 'city', socket, true);
      inv.findFirst.mockResolvedValue({ id: 'row', itemId: 'dyn', quantity: 3, item: { id: 'dyn', subType: 'DYNAMITE' } });
      const spy = vi.spyOn(engine, 'throwDynamite');

      await handleMiningThrowDynamite(io, socket, { target: { x: 5, y: 5 }, itemId: 'dyn', forceRatio: 99 });
      await handleMiningThrowDynamite(io, socket, { target: { x: 5, y: 5 }, itemId: 'dyn', forceRatio: NaN });

      expect(spy.mock.calls[0][1].forceRatio).toBe(1);
      expect(spy.mock.calls[1][1].forceRatio).toBeUndefined();
      miningSessionManager.cancelSession('throw-force');
    });
  });
});
