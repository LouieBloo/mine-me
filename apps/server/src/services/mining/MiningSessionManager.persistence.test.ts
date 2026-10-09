import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../index', () => ({ prisma: { character: { update: vi.fn().mockResolvedValue({}) } } }));
vi.mock('../characterBroadcast', () => ({ broadcastStatUpdate: vi.fn() }));
vi.mock('../inventory.service', () => ({
  InventoryService: { giveItemsToCharacter: vi.fn() },
}));

import { miningSessionManager } from './MiningSessionManager';
import { InventoryService } from '../inventory.service';

const makeSocket = () => ({ connected: true, emit: vi.fn() }) as any;

describe('MiningSessionManager loot handling & room cleanup', () => {
  beforeEach(() => {
    vi.mocked(InventoryService.giveItemsToCharacter).mockReset();
    vi.mocked(InventoryService.giveItemsToCharacter).mockResolvedValue({
      granted: [],
      skipped: [],
      experienceGranted: 0,
    });
  });

  afterEach(() => {
    miningSessionManager.cancelSession('persist-char');
    vi.restoreAllMocks();
  });

  it('endSession persists the whole backpack through one batch call, by item id', async () => {
    const engine = miningSessionManager.createSession('persist-char', 'city', makeSocket(), true);
    const session = engine.getPlayer('persist-char')!;
    session.temporaryBackpack.push(
      { itemId: 'item-1', itemName: 'Copper', quantity: 3, iconUrl: null },
      { itemId: 'item-2', itemName: 'Sol', quantity: 40, iconUrl: null }
    );

    const res = await miningSessionManager.endSession('persist-char');

    expect(InventoryService.giveItemsToCharacter).toHaveBeenCalledTimes(1);
    expect(InventoryService.giveItemsToCharacter).toHaveBeenCalledWith('persist-char', [
      { itemId: 'item-1', quantity: 3 },
      { itemId: 'item-2', quantity: 40 },
    ]);
    expect(res.extractedItems).toHaveLength(2);
    expect(miningSessionManager.getSession('persist-char')).toBeUndefined();
  });

  it('endSession does not touch the DB for an empty backpack', async () => {
    miningSessionManager.createSession('persist-char', 'city', makeSocket(), true);
    await miningSessionManager.endSession('persist-char');
    expect(InventoryService.giveItemsToCharacter).not.toHaveBeenCalled();
  });

  it('a timed-out solo room is removed and loot is not saved', () => {
    const socket = makeSocket();
    const engine = miningSessionManager.createSession('persist-char', 'city', socket, true);
    engine.getPlayer('persist-char')!.temporaryBackpack.push({ itemId: 'item-1', itemName: 'Copper', quantity: 3, iconUrl: null });
    engine.maxDurationSeconds = 1;

    (engine as any).tick(2);

    expect(socket.emit).toHaveBeenCalledWith('mining_session_timeout', expect.objectContaining({
      message: expect.stringContaining('lost'),
    }));
    expect(InventoryService.giveItemsToCharacter).not.toHaveBeenCalled();
    expect(miningSessionManager.getSession('persist-char')).toBeUndefined();
    expect(miningSessionManager.getPlayerRoomId('persist-char')).toBeUndefined();
  });

  it('a fresh session after a timeout gets a new running engine', () => {
    const first = miningSessionManager.createSession('persist-char', 'city', makeSocket(), true);
    first.maxDurationSeconds = 1;
    (first as any).tick(2);
    const second = miningSessionManager.createSession('persist-char', 'city', makeSocket());
    expect(second).not.toBe(first);
    second.stop();
  });

  it('a collapsed room (fatal tick errors) is removed', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const engine = miningSessionManager.createSession('persist-char', 'city', makeSocket(), true);
    vi.spyOn(engine.mobSubsystem, 'updateActiveMobs').mockImplementation(() => {
      throw new Error('boom');
    });
    for (let i = 0; i < 10; i++) (engine as any).tick(1 / 30);
    expect(miningSessionManager.getSession('persist-char')).toBeUndefined();
  });
});
