import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const updateCharacter = vi.fn().mockResolvedValue({});
vi.mock('../../index', () => ({ prisma: { character: { update: (...a: unknown[]) => updateCharacter(...a) } } }));
const broadcastStatUpdate = vi.fn();
vi.mock('../characterBroadcast', () => ({ broadcastStatUpdate: (...a: unknown[]) => broadcastStatUpdate(...a) }));
vi.mock('../inventory.service', () => ({ InventoryService: { giveItemsToCharacter: vi.fn() } }));

import { miningSessionManager } from './MiningSessionManager';
import { InventoryService } from '../inventory.service';
import { SANDBOX_ROOM_ID } from './gameModeRules';
import { hitPlayer } from './testHelpers';

const makeSocket = () => ({ connected: true, emit: vi.fn() }) as any;
const join = (id: string, mode: 'sandbox' | 'singleplayer' | 'multiplayer' = 'sandbox') =>
  miningSessionManager.createSession(id, 'city', makeSocket(), false, 0, mode, id, undefined, undefined, {}, null, 100);

describe('the sandbox room', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => {
    for (const id of ['sb-a', 'sb-b']) miningSessionManager.cancelSession(id, { persistHealth: false });
  });

  it('puts everyone in the one shared sandbox', () => {
    const a = join('sb-a');
    const b = join('sb-b');
    expect(a).toBe(b);
    expect(a.roomId).toBe(SANDBOX_ROOM_ID);
    expect(a.gameMode).toBe('sandbox');
    expect(a.playerCount).toBe(2);
  });

  it('is never timed out', () => {
    const engine = join('sb-a');
    engine.maxDurationSeconds = 1;
    (engine as any).tick(5);
    expect(miningSessionManager.getSession('sb-a')).toBe(engine);
  });

  it('does not save loot or health when a player leaves', async () => {
    const engine = join('sb-a');
    engine.getPlayer('sb-a')!.temporaryBackpack.push({ itemId: 'i', itemName: 'Copper', quantity: 3, iconUrl: null });
    const res = await miningSessionManager.endSession('sb-a');
    expect(res.extractedItems).toEqual([]);
    expect(InventoryService.giveItemsToCharacter).not.toHaveBeenCalled();
    expect(updateCharacter).not.toHaveBeenCalled();
  });

  it('does not save health when a player abandons it', () => {
    join('sb-a');
    miningSessionManager.cancelSession('sb-a');
    expect(updateCharacter).not.toHaveBeenCalled();
  });

  it('keeps damage out of the real health bar', () => {
    const engine = join('sb-a');
    broadcastStatUpdate.mockClear();
    expect(hitPlayer(engine, 'sb-a', 10)).toBe(true);
    expect(engine.getPlayer('sb-a')!.health).toBe(90);
    expect(broadcastStatUpdate).not.toHaveBeenCalled();
  });

  it('brings a dead player back at full health instead of ending the run', () => {
    const engine = join('sb-a');
    const session = engine.getPlayer('sb-a')!;
    session.health = 0;
    session.isDead = true;
    (engine as any).pendingDeaths.push('sb-a');
    (engine as any).processDeaths();
    expect(session.isDead).toBe(false);
    expect(session.health).toBe(session.maxHealth);
    expect(miningSessionManager.getSession('sb-a')).toBe(engine);
    expect(session.socket!.emit).not.toHaveBeenCalledWith('mining_session_ended', expect.anything());
  });
});

describe('the real modes still save', () => {
  afterEach(() => miningSessionManager.cancelSession('sb-a', { persistHealth: false }));

  it('ends a run on death', () => {
    const engine = join('sb-a', 'singleplayer');
    const session = engine.getPlayer('sb-a')!;
    session.isDead = true;
    (engine as any).pendingDeaths.push('sb-a');
    (engine as any).processDeaths();
    expect(session.socket!.emit).toHaveBeenCalledWith('mining_session_ended', expect.objectContaining({ reason: 'death' }));
  });
});
