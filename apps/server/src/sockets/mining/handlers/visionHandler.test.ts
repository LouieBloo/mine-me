import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../index', () => ({ prisma: {} }));
vi.mock('../../../services/characterBroadcast', () => ({ broadcastStatUpdate: vi.fn() }));

import { handleMiningIncreaseVision } from './exitMiningSession';
import { miningSessionManager } from '../../../services/mining/MiningSessionManager';
import { MINING_CONFIG } from '@mine-me/shared';

describe('handleMiningIncreaseVision', () => {
  const socket = { connected: true, emit: vi.fn(), data: { characterId: 'vision-char' } } as any;

  beforeEach(() => {
    miningSessionManager.cancelSession('vision-char');
    miningSessionManager.createSession('vision-char', 'city-1', socket, true);
  });

  it('increases vision by 1 when no amount is supplied', async () => {
    const res = await handleMiningIncreaseVision({} as any, socket);
    expect(res).toEqual({ success: true, data: { visionRange: MINING_CONFIG.DEFAULT_VISION_RANGE + 1 } });
  });

  it('increases by a valid positive integer', async () => {
    const res = await handleMiningIncreaseVision({} as any, socket, { amount: 3 });
    expect(res.data?.visionRange).toBe(MINING_CONFIG.DEFAULT_VISION_RANGE + 3);
  });

  it.each([0, -2, 1.5, NaN, Infinity, '5' as any, null as any])('rejects amount %s', async (amount) => {
    const res = await handleMiningIncreaseVision({} as any, socket, { amount });
    expect(res.success).toBe(false);
    expect(miningSessionManager.getSession('vision-char')!.getPlayer('vision-char')!.visionRange).toBe(MINING_CONFIG.DEFAULT_VISION_RANGE);
  });

  it('caps vision at MAX_VISION_RANGE', async () => {
    const res = await handleMiningIncreaseVision({} as any, socket, { amount: 1_000_000_000 });
    expect(res.success).toBe(true);
    expect(res.data?.visionRange).toBe(MINING_CONFIG.MAX_VISION_RANGE);
    const again = await handleMiningIncreaseVision({} as any, socket, { amount: 5 });
    expect(again.data?.visionRange).toBe(MINING_CONFIG.MAX_VISION_RANGE);
  });

  it('fails without an active session', async () => {
    miningSessionManager.cancelSession('vision-char');
    const res = await handleMiningIncreaseVision({} as any, socket, { amount: 1 });
    expect(res.success).toBe(false);
  });
});
