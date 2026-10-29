import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('../../../index', () => ({ prisma: { character: { update: vi.fn().mockResolvedValue({}), findUnique: vi.fn().mockResolvedValue(null) } } }));
vi.mock('../../../services/characterBroadcast', () => ({ broadcastStatUpdate: vi.fn() }));
vi.mock('../../../services/runStash.service', () => ({
  RunStashService: { bank: vi.fn().mockResolvedValue({ banked: [], stash: [], skipped: [] }), add: vi.fn().mockResolvedValue(undefined) },
}));

import { MINING_CONFIG } from '@mine-me/shared';
import { miningSessionManager } from '../../../services/mining/MiningSessionManager';
import { handleMiningExit } from './exitMiningSession';

const makeSocket = (characterId: string) => ({ data: { characterId }, connected: true, emit: vi.fn() }) as any;

const start = (id: string, mode: 'singleplayer' | 'sandbox' = 'singleplayer') =>
  miningSessionManager.createSession(id, 'city', makeSocket(id), true, 0, mode, id, undefined, { mobSpawnCount: 0 });

const moveTo = (id: string, x: number, y: number) => {
  miningSessionManager.getSession(id)!.getPlayer(id)!.playerBody.position = { x, y };
};

describe('leaving the mine is only allowed at the extraction point', () => {
  afterEach(() => {
    for (const id of ['exit-a', 'exit-sbx']) miningSessionManager.cancelSession(id, { persistHealth: false });
  });

  it('rejects an exit from out in the mine and keeps the run going', async () => {
    start('exit-a');
    const engine = miningSessionManager.getSession('exit-a')!;
    moveTo('exit-a', MINING_CONFIG.ENTRANCE_X + 20, engine.surfaceRow + 30);
    const res = await handleMiningExit({} as any, makeSocket('exit-a'));
    expect(res).toEqual({ success: false, error: 'You can only leave the mine at the extraction point on the surface.' });
    expect(miningSessionManager.getSession('exit-a')?.getPlayer('exit-a')).toBeDefined();
  });

  it('lets a player standing on the extraction point leave', async () => {
    start('exit-a');
    const engine = miningSessionManager.getSession('exit-a')!;
    moveTo('exit-a', MINING_CONFIG.ENTRANCE_X, engine.surfaceRow + MINING_CONFIG.ENTRANCE_Y);
    const res = await handleMiningExit({} as any, makeSocket('exit-a'));
    expect(res.success).toBe(true);
  });

  it('lets the sandbox leave from anywhere, since it saves nothing', async () => {
    start('exit-sbx', 'sandbox');
    const engine = miningSessionManager.getSession('exit-sbx')!;
    moveTo('exit-sbx', MINING_CONFIG.ENTRANCE_X + 40, engine.surfaceRow + 10);
    expect((await handleMiningExit({} as any, makeSocket('exit-sbx'))).success).toBe(true);
  });

  it('lets a player with no run through (a repeated exit returns nothing, not an error)', async () => {
    expect(miningSessionManager.canExit('nobody')).toEqual({ ok: true });
  });
});
