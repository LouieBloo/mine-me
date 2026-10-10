import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { MiningTileType } from '@mine-me/shared';
import { MiningGameEngine } from './MiningGameEngine';
import { giveBlockDrops } from './testHelpers';

describe('dropped items are only re-sent when something changes', () => {
  afterEach(() => vi.restoreAllMocks());

  const cid = 'drop-char';
  let engine: MiningGameEngine;
  let ticks: any[];

  const tick = (n = 1) => { for (let i = 0; i < n; i++) (engine as any).tick(1 / 30); };
  /** For each tick since `from`, whether the dropped-items list was included. */
  const listsSince = (from: number) => ticks.slice(from).map((t) => t.droppedItems !== undefined);

  beforeEach(() => {
    ticks = [];
    engine = new MiningGameEngine({
      characterId: cid, cityId: 'c', seed: 4, mapConfig: { mobSpawnCount: 0 },
      socket: { connected: true, emit: (e: string, p: any) => e === 'mining_state_tick' && ticks.push(p) } as any,
    });
    for (const id of [...engine.activeMobs.keys()]) engine.activeMobs.delete(id);
    // Chests drop whatever their drop table says; give this test's chests two items
    giveBlockDrops(engine, MiningTileType.CHEST, [{ itemId: 'gem' }, { itemId: 'coin', quantity: 3 }]);
    for (let x = 16; x <= 28; x++) {
      for (let y = 17; y <= 20; y++) {
        engine.grid[y][x] = { type: MiningTileType.EMPTY, revealed: true };
        engine.rigidWorld.removeTileCollider(x, y);
      }
      engine.grid[21][x] = { type: MiningTileType.DIRT, revealed: true };
    }
    engine.players.get(cid)!.playerBody.position = { x: 17.5, y: 20.5 }; // well away from the drop
    tick(2); // clear the initial "everything is new" flag
  });

  it('sends nothing while no items exist or move', () => {
    const before = ticks.length;
    tick(60);
    expect(listsSince(before).some(Boolean)).toBe(false);
  });

  it('sends the list when items spawn and while they fall, then stops once they come to rest', () => {
    const before = ticks.length;
    engine.spawnBlockDrops(25, 20, MiningTileType.CHEST);
    expect(engine.droppedItems.length).toBeGreaterThan(0);
    tick(90); // 3 seconds

    const sent = listsSince(before);
    expect(sent[0]).toBe(true); // announced on the very next tick
    expect(sent.filter(Boolean).length).toBeGreaterThan(1); // updates while falling
    expect(sent.slice(-45).some(Boolean)).toBe(false); // settled: the last 1.5 s send nothing
    expect(engine.droppedItems.every((i) => Math.abs(i.velocity?.y ?? 0) < 0.01)).toBe(true);
  });

  it('ticks carry only ids and positions; each item is described once, in `spawned`', () => {
    engine.spawnBlockDrops(25, 20, MiningTileType.CHEST);
    tick(30);
    const described = ticks.flatMap((t) => t.spawned?.droppedItems ?? []);
    expect(described.map((d: any) => d.id).sort()).toEqual(engine.droppedItems.map((d) => d.id).sort());
    for (const t of ticks.filter((t) => t.droppedItems)) {
      for (const d of t.droppedItems) expect(Object.keys(d).sort()).toEqual(['id', 'position']);
    }
    expect(new Set(described.map((d: any) => d.id)).size).toBe(described.length); // never described twice
  });

  it('every send carries the full current list (so late changes are never lost)', () => {
    const before = ticks.length;
    engine.spawnBlockDrops(25, 20, MiningTileType.CHEST);
    tick(5);
    const withList = ticks.slice(before).filter((t) => t.droppedItems);
    expect(withList.length).toBeGreaterThan(0);
    for (const t of withList) expect(t.droppedItems.length).toBe(engine.droppedItems.length);
  });

  it('sends the list again when an item is picked up, including an empty list when the last one goes', () => {
    engine.spawnBlockDrops(25, 20, MiningTileType.CHEST);
    tick(60); // settled
    const count = engine.droppedItems.length;
    expect(count).toBeGreaterThan(0);

    const before = ticks.length;
    const me = engine.players.get(cid)!;
    me.playerBody.position = { ...engine.droppedItems[0].position };
    tick(2);

    const sent = ticks.slice(before).filter((t) => t.droppedItems !== undefined);
    expect(sent.length).toBeGreaterThan(0);
    expect(engine.droppedItems.length).toBeLessThan(count);
    expect(me.temporaryBackpack.length).toBeGreaterThan(0);

    // Pick up whatever is left; the final empty list must reach clients so they clear their sprites
    for (const item of [...engine.droppedItems]) {
      me.playerBody.position = { ...item.position };
      tick(2);
    }
    expect(engine.droppedItems).toHaveLength(0);
    expect(ticks.filter((t) => t.droppedItems !== undefined).pop()!.droppedItems).toEqual([]);
  });

  it('releases the physics body of a picked-up item', () => {
    engine.spawnBlockDrops(25, 20, MiningTileType.CHEST);
    tick(60);
    const me = engine.players.get(cid)!;
    for (const item of [...engine.droppedItems]) {
      me.playerBody.position = { ...item.position };
      tick(2);
    }
    expect(engine.activeItemBodies.size).toBe(0);
  });

  it('a settled item that is disturbed (e.g. its floor is mined away) is announced again', () => {
    engine.spawnBlockDrops(25, 20, MiningTileType.CHEST);
    tick(60);
    const before = ticks.length;
    const item = engine.droppedItems[0];
    // Dig out the floor under the item
    const tx = Math.floor(item.position.x);
    engine.grid[21][tx] = { type: MiningTileType.EMPTY, revealed: true };
    engine.rigidWorld.removeTileCollider(tx, 21);
    tick(60);
    expect(listsSince(before).some(Boolean)).toBe(true);
  });

  it('does not grow past the hard limit however many blocks are mined', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (let i = 0; i < 1500; i++) engine.spawnBlockDrops(25, 20, MiningTileType.CHEST); // more drops than the limit allows
    expect(engine.droppedItems.length).toBe(1000);
    expect(engine.activeItemBodies.size).toBeLessThanOrEqual(1000);
  });
});
