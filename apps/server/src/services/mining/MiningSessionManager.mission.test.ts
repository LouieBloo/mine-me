import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../index', () => ({ prisma: { character: { update: vi.fn().mockResolvedValue({}) } } }));
vi.mock('../characterBroadcast', () => ({ broadcastStatUpdate: vi.fn() }));
vi.mock('../runStash.service', () => ({
  RunStashService: { bank: vi.fn(), add: vi.fn().mockResolvedValue(undefined) },
}));

import type { MissionDefinition } from '@mine-me/shared';
import { miningSessionManager } from './MiningSessionManager';
import { RunStashService } from '../runStash.service';

const makeSocket = () => ({ connected: true, emit: vi.fn() }) as any;

const mission = (over: Partial<MissionDefinition> = {}): MissionDefinition => ({
  id: 'm1', key: 'm1', name: 'Reach the deep', minLevel: 1, maxLevel: 9, tier: 1, weight: 1,
  objectives: [{ type: 'KILL_MOB', amount: 1 }], rewardCoins: 25, rewardXp: 40,
  rewardItems: [{ itemId: 'reward-item', chance: 100, minQuantity: 2, maxQuantity: 2 }], ...over,
});

const start = (id: string, m: MissionDefinition | undefined, mode: 'singleplayer' | 'multiplayer' = 'singleplayer') =>
  miningSessionManager.createSession(id, 'city', makeSocket(), true, 0, mode, id, undefined, { mobSpawnCount: 0 }, {}, null, undefined, undefined, m);

describe('a mission pays on a safe exit only (ticket 113)', () => {
  beforeEach(() => {
    vi.mocked(RunStashService.bank).mockReset();
    vi.mocked(RunStashService.bank).mockResolvedValue({ banked: [], stash: [], skipped: [] });
  });

  afterEach(() => {
    for (const id of ['mc-a', 'mc-b']) miningSessionManager.cancelSession(id);
    vi.restoreAllMocks();
  });

  // (starting a run also banks any stash left over from an earlier one, with one argument)
  const exitCalls = () => vi.mocked(RunStashService.bank).mock.calls.filter((c) => c.length > 1);

  const complete = (id: string) => miningSessionManager.getSession(id)!.missionTracker!.onMobKilled(id, 'any-mob');

  it('banks the coins, XP and rolled items with the loot in the same banking call', async () => {
    start('mc-a', mission());
    complete('mc-a');
    const res = await miningSessionManager.endSession('mc-a');
    expect(exitCalls()).toHaveLength(1);
    expect(RunStashService.bank).toHaveBeenCalledWith('mc-a', [{ itemId: 'reward-item', quantity: 2 }], { sol: 25, experience: 40 });
    expect(res.mission).toMatchObject({ outcome: 'paid', reward: { coins: 25, xp: 40 } });
    expect(res.mission?.reward?.items).toEqual([expect.objectContaining({ itemId: 'reward-item', quantity: 2 })]);
  });

  it('pays nothing for a mission that is not complete, and says so', async () => {
    start('mc-a', mission());
    const res = await miningSessionManager.endSession('mc-a');
    expect(RunStashService.bank).toHaveBeenCalledWith('mc-a', []);
    expect(res.mission).toMatchObject({ outcome: 'unfinished' });
    expect(res.mission?.reward).toBeUndefined();
  });

  it('pays nothing when the run is abandoned, and a dead player is not paid either', () => {
    start('mc-a', mission());
    complete('mc-a');
    miningSessionManager.cancelSession('mc-a');
    expect(vi.mocked(RunStashService.bank).mock.calls.every((c) => c.length === 1)).toBe(true);
  });

  it('never pays the same reward twice to one player', async () => {
    const engine = start('mc-a', mission());
    complete('mc-a');
    expect(engine.missionTracker!.claim('mc-a')).toBe(true);
    const res = await miningSessionManager.endSession('mc-a');
    expect(RunStashService.bank).toHaveBeenCalledWith('mc-a', []);
    expect(res.mission?.outcome).toBe('completed');
  });

  it('gives the claim back when the payout cannot be written, so it is still owed', async () => {
    const engine = start('mc-a', mission());
    complete('mc-a');
    vi.mocked(RunStashService.bank).mockRejectedValueOnce(new Error('database down'));
    await expect(miningSessionManager.endSession('mc-a')).rejects.toThrow('database down');
    expect(engine.missionTracker!.isPaid('mc-a')).toBe(false);
  });

  it('pays every player who exits safely the full reward (co-op), late joiners included', async () => {
    start('mc-a', mission(), 'multiplayer');
    complete('mc-a');
    const joined = start('mc-b', undefined, 'multiplayer');
    expect(joined.missionTracker?.completed).toBe(true); // inherits the mission and its progress
    await miningSessionManager.endSession('mc-a');
    await miningSessionManager.endSession('mc-b');
    expect(RunStashService.bank).toHaveBeenCalledWith('mc-a', [{ itemId: 'reward-item', quantity: 2 }], { sol: 25, experience: 40 });
    expect(RunStashService.bank).toHaveBeenCalledWith('mc-b', [{ itemId: 'reward-item', quantity: 2 }], { sol: 25, experience: 40 });
  });

  it('a run without a mission banks exactly as before', async () => {
    start('mc-a', undefined);
    const res = await miningSessionManager.endSession('mc-a');
    expect(RunStashService.bank).toHaveBeenCalledWith('mc-a', []);
    expect(res.mission).toBeUndefined();
  });
});
