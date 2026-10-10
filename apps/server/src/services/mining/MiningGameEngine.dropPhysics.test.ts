import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MiningTileType, isTileSolid } from '@mine-me/shared';
import { MiningGameEngine } from './MiningGameEngine';
import { giveBlockDrops } from './testHelpers';

describe('a blast that drops a lot of items at once', () => {
  afterEach(() => vi.restoreAllMocks());

  const cid = 'drop-physics';
  const CX = 20;
  const CY = 25;
  let engine: MiningGameEngine;
  const tick = (n: number) => { for (let i = 0; i < n; i++) (engine as any).tick(1 / 30); };
  const blast = (radius = 5) =>
    engine.explodeDynamite({ id: 'd', position: { x: CX, y: CY }, explosionRadius: radius, ownerId: cid } as any);

  beforeEach(() => {
    engine = new MiningGameEngine({
      characterId: cid, cityId: 'c', seed: 3, mapConfig: { mobSpawnCount: 0 },
      socket: { connected: true, emit: () => {} } as any,
    });
    for (const id of [...engine.activeMobs.keys()]) engine.activeMobs.delete(id);
    giveBlockDrops(engine, MiningTileType.DIRT, [{ itemId: 'a' }, { itemId: 'b', quantity: 2 }]);
    for (let y = CY - 8; y <= CY + 8; y++) {
      for (let x = CX - 10; x <= CX + 10; x++) {
        engine.grid[y][x] = { type: MiningTileType.DIRT, revealed: true };
        engine.rigidWorld.addTileCollider(x, y);
      }
    }
    engine.players.get(cid)!.playerBody.position = { x: 5.5, y: 5.5 };
  });

  it('settles every item in open space, never inside a solid block', () => {
    blast();
    const dropped = engine.droppedItems.length;
    expect(dropped).toBeGreaterThan(100);
    tick(150);
    expect(engine.droppedItems.length).toBe(dropped);
    const embedded = engine.droppedItems.filter((it) => {
      const tile = engine.grid[Math.floor(it.position.y)]?.[Math.floor(it.position.x)];
      return !tile || isTileSolid(tile.type);
    });
    expect(embedded).toEqual([]);
  });

  it('items do not push each other: a pile settles quickly and cheaply', () => {
    blast();
    const started = performance.now();
    tick(150);
    expect(performance.now() - started).toBeLessThan(2000);
  });

  it('the player picks up every item by walking over the crater floor', () => {
    blast();
    tick(150);
    const session = engine.players.get(cid)!;
    const expectedTotal = engine.droppedItems.reduce((n, i) => n + i.quantity, 0);
    for (const item of [...engine.droppedItems]) {
      session.playerBody.position = { x: item.position.x, y: item.position.y };
      engine.dropSubsystem.checkItemPickupsForPlayer(session);
    }
    expect(engine.droppedItems).toEqual([]);
    expect(engine.activeItemBodies.size).toBe(0);
    expect(session.temporaryBackpack.reduce((n, b) => n + b.quantity, 0)).toBe(expectedTotal);
  });
});
