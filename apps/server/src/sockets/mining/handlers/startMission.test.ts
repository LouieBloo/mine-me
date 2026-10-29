import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../index', () => ({
  prisma: {
    character: { findUnique: vi.fn(), update: vi.fn().mockResolvedValue({}) },
    characterLevel: { findMany: vi.fn().mockResolvedValue([{ level: 1, xpRequired: 0 }, { level: 2, xpRequired: 100 }]) },
  },
}));
vi.mock('../../../services/characterBroadcast', () => ({ broadcastStatUpdate: vi.fn() }));
vi.mock('../../../services/miningConfig.service', () => ({ getActiveMiningConfig: vi.fn().mockResolvedValue(undefined) }));

import type { MissionDefinition } from '@mine-me/shared';
import { prisma } from '../../../index';
import { miningSessionManager } from '../../../services/mining/MiningSessionManager';
import { MiningDataManager } from '../../../services/mining/subsystems/MiningDataManager';
import { MissionOfferService } from '../../../services/missionOffer.service';
import { handleMiningMissionOffers, handleMiningStart } from './startMiningSession';

const cid = 'start-mission-char';
const socket = { data: { userId: 'u1', characterId: cid }, connected: true, emit: vi.fn() } as any;
const character = (over: any = {}) => ({ id: cid, userId: 'u1', name: 'Hero', status: 'ACTIVE', cityId: 'city', health: 100, maxHealth: 100, experience: 0, maxInventorySlots: 25, inventory: [], ...over });

const mission = (id: string, over: Partial<MissionDefinition> = {}): MissionDefinition => ({
  id, key: id, name: `Mission ${id}`, minLevel: 1, maxLevel: 5, tier: 1, weight: 1,
  objectives: [{ type: 'KILL_MOB', amount: 2 }], rewardCoins: 10, rewardXp: 5, rewardItems: [], ...over,
});
const pool = ['a', 'b', 'c', 'd', 'e'].map((id) => mission(id));

describe('picking a mission before the run (ticket 111)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    MissionOfferService.clear(cid);
    (prisma.character.findUnique as any).mockResolvedValue(character());
    const data = MiningDataManager.getInstance();
    vi.spyOn(data, 'getMissions').mockReturnValue(pool);
    vi.spyOn(data, 'getMission').mockImplementation((id: string) => pool.find((m) => m.id === id));
  });
  afterEach(() => {
    miningSessionManager.cancelSession(cid, { persistHealth: false });
    miningSessionManager.cancelSession('other-char', { persistHealth: false });
    vi.restoreAllMocks();
  });

  it('offers missions for the character\'s level, the same list every time', async () => {
    const first = await handleMiningMissionOffers({} as any, socket, { mode: 'singleplayer' });
    expect(first.success).toBe(true);
    expect(first.data!.offers.length).toBeGreaterThanOrEqual(2);
    expect(first.data!.offers[0]).toMatchObject({ tier: 1, reward: { coins: 10, xp: 5 } });
    const again = await handleMiningMissionOffers({} as any, socket, { mode: 'singleplayer' });
    expect(again.data!.offers.map((o: any) => o.id)).toEqual(first.data!.offers.map((o: any) => o.id));
  });

  it('offers nothing to a character no mission fits, and to the sandbox', async () => {
    (prisma.character.findUnique as any).mockResolvedValue(character({ experience: 99999 }));
    // (level 2 is the highest configured, and no mission reaches it)
    vi.spyOn(MiningDataManager.getInstance(), 'getMissions').mockReturnValue([mission('only', { minLevel: 5, maxLevel: 6 })]);
    expect((await handleMiningMissionOffers({} as any, socket, { mode: 'singleplayer' })).data!.offers).toEqual([]);
    expect((await handleMiningMissionOffers({} as any, socket, { mode: 'sandbox' })).data!.offers).toEqual([]);
    expect((await handleMiningMissionOffers({} as any, socket, { mode: 'dungeon' as any })).success).toBe(false);
  });

  it('starts the run with the picked mission, tracked from the first tick', async () => {
    const offers = (await handleMiningMissionOffers({} as any, socket, { mode: 'singleplayer' })).data!.offers;
    const res = await handleMiningStart({} as any, socket, { forceNew: true, mode: 'singleplayer', missionId: offers[1].id });
    expect(res.success).toBe(true);
    expect(res.data!.sessionState.mission).toMatchObject({ id: offers[1].id, completed: false });
    expect(miningSessionManager.getSession(cid)!.missionTracker).not.toBeNull();
  });

  it('refuses a mission that was not offered, and starts nothing', async () => {
    await handleMiningMissionOffers({} as any, socket, { mode: 'singleplayer' });
    const res = await handleMiningStart({} as any, socket, { forceNew: true, mode: 'singleplayer', missionId: 'zzz' });
    expect(res).toMatchObject({ success: false, error: expect.stringContaining('not one of your offers') });
    expect(miningSessionManager.getSession(cid)).toBeUndefined();
  });

  it('starts without a mission when none is picked, and drops the kept roll', async () => {
    await handleMiningMissionOffers({} as any, socket, { mode: 'singleplayer' });
    const res = await handleMiningStart({} as any, socket, { forceNew: true, mode: 'singleplayer' });
    expect(res.success).toBe(true);
    expect(res.data!.sessionState.mission).toBeUndefined();
    expect(MissionOfferService.hasOffers(cid)).toBe(false);
  });

  it('cannot use an offer twice for a second run', async () => {
    const offers = (await handleMiningMissionOffers({} as any, socket, { mode: 'singleplayer' })).data!.offers;
    await handleMiningStart({} as any, socket, { forceNew: true, mode: 'singleplayer', missionId: offers[0].id });
    miningSessionManager.cancelSession(cid, { persistHealth: false });
    const second = await handleMiningStart({} as any, socket, { forceNew: true, mode: 'singleplayer', missionId: offers[0].id });
    expect(second.success).toBe(false);
  });

  it('a player joining a shared lobby inherits its mission and has nothing to pick', async () => {
    const owner = { data: { userId: 'u1', characterId: cid }, connected: true, emit: vi.fn() } as any;
    const offers = (await handleMiningMissionOffers({} as any, owner, { mode: 'multiplayer' })).data!.offers;
    await handleMiningStart({} as any, owner, { forceNew: true, mode: 'multiplayer', missionId: offers[0].id });

    const joiner = { data: { userId: 'u2', characterId: 'other-char' }, connected: true, emit: vi.fn() } as any;
    (prisma.character.findUnique as any).mockResolvedValue(character({ id: 'other-char', userId: 'u2' }));
    const shown = await handleMiningMissionOffers({} as any, joiner, { mode: 'multiplayer' });
    expect(shown.data!.offers).toEqual([]);
    expect(shown.data!.joining).toMatchObject({ id: offers[0].id });
    const joined = await handleMiningStart({} as any, joiner, { mode: 'multiplayer', missionId: 'ignored' });
    expect(joined.data!.sessionState.mission).toMatchObject({ id: offers[0].id });
  });
});
