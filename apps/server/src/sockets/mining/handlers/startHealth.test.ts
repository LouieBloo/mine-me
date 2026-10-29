import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../index', () => ({
  prisma: { character: { findUnique: vi.fn(), update: vi.fn().mockResolvedValue({}) } },
}));
vi.mock('../../../services/characterBroadcast', () => ({ broadcastStatUpdate: vi.fn() }));
vi.mock('../../../services/miningConfig.service', () => ({ getActiveMiningConfig: vi.fn().mockResolvedValue(undefined) }));

import { prisma } from '../../../index';
import { broadcastStatUpdate } from '../../../services/characterBroadcast';
import { miningSessionManager } from '../../../services/mining/MiningSessionManager';
import { handleMiningStart } from './startMiningSession';
import { hitPlayer } from '../../../services/mining/testHelpers';

const cid = 'start-hp-char';
const socket = { data: { userId: 'u1', characterId: cid }, connected: true, emit: vi.fn() } as any;
const character = (over: any = {}) => ({
  id: cid, userId: 'u1', name: 'Hero', status: 'ACTIVE', cityId: 'city',
  health: 30, maxHealth: 130, maxInventorySlots: 25, inventory: [], ...over,
});

describe('handleMiningStart health', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.character.findUnique as any).mockResolvedValue(character());
  });
  afterEach(() => miningSessionManager.cancelSession(cid, { persistHealth: false }));

  it('starts the run at the character\'s max health (not their current health) and shows it in the app', async () => {
    const res = await handleMiningStart({} as any, socket, { forceNew: true });
    expect(res.success).toBe(true);
    const player = miningSessionManager.getSession(cid)!.getPlayer(cid)!;
    expect(player.health).toBe(130);
    expect(player.maxHealth).toBe(130);
    expect(broadcastStatUpdate).toHaveBeenCalledWith(cid, { health: 130, maxHealth: 130 });
  });

  it('re-entering an existing run does not heal the player', async () => {
    await handleMiningStart({} as any, socket, { forceNew: true });
    hitPlayer(miningSessionManager.getSession(cid)!, cid, 50);
    vi.mocked(broadcastStatUpdate).mockClear();

    await handleMiningStart({} as any, socket, {});

    expect(miningSessionManager.getSession(cid)!.getPlayer(cid)!.health).toBe(80);
    expect(broadcastStatUpdate).toHaveBeenCalledWith(cid, { health: 80, maxHealth: 130 });
  });
});

describe('handleMiningStart biome picks (ticket 144)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.character.findUnique as any).mockResolvedValue(character());
  });
  afterEach(() => miningSessionManager.cancelSession(cid, { persistHealth: false }));

  it('hands a Single Player run its picked biomes (well formed keys only)', async () => {
    await handleMiningStart({} as any, socket, { forceNew: true, mode: 'singleplayer', biomeKeys: ['deep_stone', 5, 'Not A Key'] });
    expect(miningSessionManager.getSession(cid)!.runBiomeKeys).toEqual(['deep_stone']);
  });

  it('starts a normal map with no picks', async () => {
    await handleMiningStart({} as any, socket, { forceNew: true, mode: 'singleplayer' });
    expect(miningSessionManager.getSession(cid)!.runBiomeKeys).toEqual([]);
  });

  it('does not let a multiplayer or sandbox start choose biomes', async () => {
    await handleMiningStart({} as any, socket, { forceNew: true, mode: 'multiplayer', biomeKeys: ['deep_stone'] });
    expect(miningSessionManager.getSession(cid)!.runBiomeKeys).toEqual([]);
    miningSessionManager.cancelSession(cid, { persistHealth: false });
    await handleMiningStart({} as any, socket, { forceNew: true, mode: 'sandbox', biomeKeys: ['deep_stone'] });
    expect(miningSessionManager.getSession(cid)!.runBiomeKeys).toEqual([]);
  });
});
