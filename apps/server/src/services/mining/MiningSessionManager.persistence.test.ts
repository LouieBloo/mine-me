import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../index', () => ({ prisma: { character: { update: vi.fn().mockResolvedValue({}) } } }));
vi.mock('../characterBroadcast', () => ({ broadcastStatUpdate: vi.fn() }));
vi.mock('../runStash.service', () => ({
  RunStashService: { bank: vi.fn(), add: vi.fn().mockResolvedValue(undefined) },
}));

import { miningSessionManager } from './MiningSessionManager';
import { RunStashService } from '../runStash.service';

const makeSocket = () => ({ connected: true, emit: vi.fn() }) as any;

describe('MiningSessionManager loot handling & room cleanup', () => {
  beforeEach(() => {
    vi.mocked(RunStashService.bank).mockReset();
    vi.mocked(RunStashService.bank).mockResolvedValue({ banked: [], stash: [], skipped: [] });
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

    // The backpack goes in with the stash, in one banking call
    expect(vi.mocked(RunStashService.bank).mock.calls.filter((c) => c.length > 1)).toHaveLength(1);
    expect(RunStashService.bank).toHaveBeenCalledWith('persist-char', [
      { itemId: 'item-1', quantity: 3 },
      { itemId: 'item-2', quantity: 40 },
    ]);
    expect(res.extractedItems).toHaveLength(2);
    expect(miningSessionManager.getSession('persist-char')).toBeUndefined();
  });

  it('endSession banks only the stash for an empty backpack', async () => {
    miningSessionManager.createSession('persist-char', 'city', makeSocket(), true);
    await miningSessionManager.endSession('persist-char');
    expect(vi.mocked(RunStashService.bank).mock.calls.filter((c) => c.length > 1)).toHaveLength(1);
    expect(RunStashService.bank).toHaveBeenCalledWith('persist-char', []);
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
    // the backpack is lost: only the stash is banked (no items passed with it)
    expect(RunStashService.bank).not.toHaveBeenCalledWith('persist-char', expect.anything());
    expect(miningSessionManager.getSession('persist-char')).toBeUndefined();
    expect(miningSessionManager.getPlayerRoomId('persist-char')).toBeUndefined();
  });

  it('death and timeout keep the stash: it is banked on its own, without the backpack', async () => {
    const engine = miningSessionManager.createSession('persist-char', 'city', makeSocket(), true);
    engine.getPlayer('persist-char')!.temporaryBackpack.push({ itemId: 'item-1', itemName: 'Copper', quantity: 3, iconUrl: null });
    vi.mocked(RunStashService.bank).mockClear();
    miningSessionManager.cancelSession('persist-char');
    expect(RunStashService.bank).toHaveBeenCalledTimes(1);
    expect(RunStashService.bank).toHaveBeenCalledWith('persist-char');
  });

  it('writes the player\'s unsaved deposits before banking when a room times out', () => {
    const engine = miningSessionManager.createSession('persist-char', 'city', makeSocket(), true);
    const session = engine.getPlayer('persist-char')!;
    session.unsavedStash.set('item-1', 4);
    vi.mocked(RunStashService.add).mockClear();
    vi.mocked(RunStashService.bank).mockClear();
    engine.maxDurationSeconds = 1;
    (engine as any).tick(2);
    expect(RunStashService.add).toHaveBeenCalledWith('persist-char', [{ itemId: 'item-1', quantity: 4 }]);
    expect(RunStashService.bank).toHaveBeenCalledWith('persist-char');
    expect(vi.mocked(RunStashService.add).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(RunStashService.bank).mock.invocationCallOrder[0]);
  });

  it('banks a stash left over from a crashed run when a new run starts', () => {
    vi.mocked(RunStashService.bank).mockClear();
    miningSessionManager.createSession('persist-char', 'city', makeSocket(), true);
    expect(RunStashService.bank).toHaveBeenCalledWith('persist-char');
  });

  it('exit banks the backpack and the stash in one call and reports them separately and together', async () => {
    const engine = miningSessionManager.createSession('persist-char', 'city', makeSocket(), true);
    engine.getPlayer('persist-char')!.temporaryBackpack.push({ itemId: 'item-1', itemName: 'Copper', quantity: 3, iconUrl: null });
    vi.mocked(RunStashService.bank).mockClear();
    vi.mocked(RunStashService.bank).mockResolvedValue({ banked: [], stash: [{ itemId: 'item-1', quantity: 2 }, { itemId: 'item-9', quantity: 5 }], skipped: [] });

    const res = await miningSessionManager.endSession('persist-char');

    expect(vi.mocked(RunStashService.bank).mock.calls.filter((c) => c.length > 1)).toEqual([['persist-char', [{ itemId: 'item-1', quantity: 3 }]]]);
    expect(res.backpackItems.map((i) => [i.itemId, i.quantity])).toEqual([['item-1', 3]]);
    expect(res.stashItems.map((i) => [i.itemId, i.quantity])).toEqual([['item-1', 2], ['item-9', 5]]);
    expect(res.extractedItems.map((i) => [i.itemId, i.quantity])).toEqual([['item-1', 5], ['item-9', 5]]);
  });

  it('a second exit banks nothing more (the room and player are already gone)', async () => {
    miningSessionManager.createSession('persist-char', 'city', makeSocket(), true);
    vi.mocked(RunStashService.bank).mockClear();
    await miningSessionManager.endSession('persist-char');
    const banksAfterFirst = vi.mocked(RunStashService.bank).mock.calls.length;
    const again = await miningSessionManager.endSession('persist-char');
    expect(again).toEqual({ extractedItems: [], backpackItems: [], stashItems: [] });
    expect(vi.mocked(RunStashService.bank).mock.calls.length).toBe(banksAfterFirst);
  });

  it('in a shared room one player leaving banks only their own loot and leaves the others and the extractor', async () => {
    const a = miningSessionManager.createSession('persist-char', 'city', makeSocket(), true, 0, 'multiplayer');
    miningSessionManager.createSession('other-char', 'city', makeSocket(), false, 0, 'multiplayer');
    a.getPlayer('persist-char')!.temporaryBackpack.push({ itemId: 'item-1', itemName: 'Copper', quantity: 3, iconUrl: null });
    a.getPlayer('other-char')!.temporaryBackpack.push({ itemId: 'item-2', itemName: 'Silver', quantity: 7, iconUrl: null });
    a.getPlayer('other-char')!.stash.push({ itemId: 'item-3', itemName: 'Gold', quantity: 1, iconUrl: null });
    vi.mocked(RunStashService.bank).mockClear();

    await miningSessionManager.endSession('persist-char');

    expect(vi.mocked(RunStashService.bank).mock.calls.filter((c) => c.length > 1)).toEqual([['persist-char', [{ itemId: 'item-1', quantity: 3 }]]]);
    const stillThere = miningSessionManager.getSession('other-char')!;
    expect(stillThere.getPlayer('other-char')!.temporaryBackpack[0].quantity).toBe(7);
    expect(stillThere.getPlayer('other-char')!.stash[0].quantity).toBe(1);
    expect(stillThere.extractorSubsystem).not.toBeNull();
    miningSessionManager.cancelSession('other-char');
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
