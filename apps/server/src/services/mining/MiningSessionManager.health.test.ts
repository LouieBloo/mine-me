import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../index', () => ({ prisma: { character: { update: vi.fn() } } }));
vi.mock('../inventory.service', () => ({
  InventoryService: { giveItemsToCharacter: vi.fn().mockResolvedValue({ granted: [], skipped: [], experienceGranted: 0 }) },
}));
vi.mock('../characterBroadcast', () => ({ broadcastStatUpdate: vi.fn() }));

import { prisma } from '../../index';
import { broadcastStatUpdate } from '../characterBroadcast';
import { InventoryService } from '../inventory.service';
import { miningSessionManager } from './MiningSessionManager';
import { hitMob, hitPlayer } from './testHelpers';

const update = prisma.character.update as any;
const cid = 'hp-mgr-char';
const mkSocket = () => ({ connected: true, emit: vi.fn() }) as any;
const flush = () => new Promise((r) => setTimeout(r, 0));
const tick = (engine: any, n = 1) => { for (let i = 0; i < n; i++) engine.tick(1 / 30); };

describe('MiningSessionManager health handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    update.mockResolvedValue({});
  });
  afterEach(() => {
    miningSessionManager.cancelSession(cid, { persistHealth: false });
  });

  it('creates the player with the character\'s max health', () => {
    const engine = miningSessionManager.createSession(cid, 'c', mkSocket(), true, 0, 'singleplayer', 'N', [], undefined, {}, null, 140);
    expect(engine.getPlayer(cid)!.health).toBe(140);
    expect(engine.getPlayer(cid)!.maxHealth).toBe(140);
  });

  it('pushes damage to the app health bar as it happens (no DB write mid-run)', () => {
    const engine = miningSessionManager.createSession(cid, 'c', mkSocket(), true);
    hitPlayer(engine, cid, 25.4);
    expect(broadcastStatUpdate).toHaveBeenCalledWith(cid, { health: 75 });
    expect(update).not.toHaveBeenCalled();
  });

  it('writes the final health on a normal extraction, even if saving loot fails', async () => {
    const engine = miningSessionManager.createSession(cid, 'c', mkSocket(), true);
    hitPlayer(engine, cid, 40);
    engine.getPlayer(cid)!.temporaryBackpack.push({ itemId: 'i', itemName: 'x', quantity: 1, iconUrl: null });
    vi.mocked(InventoryService.giveItemsToCharacter).mockRejectedValueOnce(new Error('db down'));

    await expect(miningSessionManager.endSession(cid)).rejects.toThrow('db down');

    expect(update).toHaveBeenCalledWith({ where: { id: cid }, data: { health: 60 } });
    expect(broadcastStatUpdate).toHaveBeenLastCalledWith(cid, { health: 60 });
  });

  it('writes the health when a run is abandoned or the player disconnects', async () => {
    const engine = miningSessionManager.createSession(cid, 'c', mkSocket(), true);
    hitPlayer(engine, cid, 10);
    miningSessionManager.cancelSession(cid);
    await flush();
    expect(update).toHaveBeenCalledWith({ where: { id: cid }, data: { health: 90 } });
  });

  it('never writes less than 1 HP for a living player', async () => {
    const engine = miningSessionManager.createSession(cid, 'c', mkSocket(), true);
    engine.getPlayer(cid)!.health = 0.2;
    miningSessionManager.cancelSession(cid);
    await flush();
    expect(update).toHaveBeenCalledWith({ where: { id: cid }, data: { health: 1 } });
  });

  it('writes the health when the room times out or collapses', async () => {
    const engine = miningSessionManager.createSession(cid, 'c', mkSocket(), true);
    hitPlayer(engine, cid, 35);
    engine.maxDurationSeconds = 1;
    tick(engine, 40);
    await flush();
    expect(update).toHaveBeenCalledWith({ where: { id: cid }, data: { health: 65 } });
    expect(miningSessionManager.getSession(cid)).toBeUndefined();
  });

  describe('death', () => {
    it('ends the run, loses the loot, and leaves the character at 1 HP', async () => {
      const socket = mkSocket();
      const engine = miningSessionManager.createSession(cid, 'c', socket, true);
      engine.getPlayer(cid)!.temporaryBackpack.push({ itemId: 'i', itemName: 'x', quantity: 5, iconUrl: null });

      hitPlayer(engine, cid, 9999);
      tick(engine);
      await flush();

      expect(socket.emit).toHaveBeenCalledWith('mining_session_ended', expect.objectContaining({ reason: 'death' }));
      expect(InventoryService.giveItemsToCharacter).not.toHaveBeenCalled();
      expect(update).toHaveBeenCalledWith({ where: { id: cid }, data: { health: 1 } });
      expect(broadcastStatUpdate).toHaveBeenLastCalledWith(cid, { health: 1 });
      expect(miningSessionManager.getSession(cid)).toBeUndefined();
      expect(miningSessionManager.getPlayerRoomId(cid)).toBeUndefined();
      expect(update).toHaveBeenCalledTimes(1); // only one write, not one for the cancel and one for the death
    });

    it('in multiplayer, only the dead player leaves; the room keeps running', async () => {
      const other = 'hp-mgr-other';
      const e1 = miningSessionManager.createSession(cid, 'c', mkSocket(), false, 0, 'multiplayer');
      const e2 = miningSessionManager.createSession(other, 'c', mkSocket(), false, 0, 'multiplayer');
      expect(e1).toBe(e2);

      hitPlayer(e1, cid, 9999);
      tick(e1);
      await flush();

      expect(miningSessionManager.getSession(cid)).toBeUndefined();
      expect(miningSessionManager.getPlayerRoomId(other)).toBeDefined();
      expect(e1.players.has(other)).toBe(true);
      miningSessionManager.cancelSession(other, { persistHealth: false });
    });

    it('a failing health write does not break leaving the mine', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      update.mockRejectedValue(new Error('db down'));
      const engine = miningSessionManager.createSession(cid, 'c', mkSocket(), true);
      hitPlayer(engine, cid, 9999);
      expect(() => tick(engine)).not.toThrow();
      await flush();
      expect(miningSessionManager.getSession(cid)).toBeUndefined();
    });
  });
});
