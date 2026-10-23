import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MiningTileType } from '@mine-me/shared';
import { MiningGameEngine } from './MiningGameEngine';

describe('items riding the conveyor belt (ticket 123)', () => {
  const cid = 'rider';
  let emitted: { event: string; payload: any }[];
  let engine: MiningGameEngine;
  const tickFor = (seconds: number) => { for (let i = 0; i < Math.round(seconds * 30); i++) (engine as any).tick(1 / 30); };
  const belt = () => engine.beltSubsystem!;
  const def = () => engine.extractorSubsystem!.definition;
  const me = (id = cid) => engine.players.get(id)!;
  const give = (itemId: string, quantity: number, id = cid) => me(id).temporaryBackpack.push({ itemId, itemName: itemId, iconUrl: null, quantity });
  const onBelt = (depth: number, id = cid) => { me(id).playerBody.position = { x: belt().shaftX + 1.5, y: belt().startRow + depth }; };
  const away = (id = cid) => { me(id).playerBody.position = { x: 3, y: engine.surfaceRow }; };
  const stashOf = (itemId: string, id = cid) => me(id).stash.find((s) => s.itemId === itemId)?.quantity ?? 0;
  const packOf = (itemId: string, id = cid) => me(id).temporaryBackpack.find((s) => s.itemId === itemId)?.quantity ?? 0;

  /** Lands the extractor and digs `rows` segments, then leaves everything quiet. */
  const dig = (rows: number) => {
    tickFor(def().landingSeconds + 0.1);
    tickFor(def().buildSecondsPerSegment * rows + 0.5);
    expect(belt().rows).toBeGreaterThanOrEqual(rows);
  };

  beforeEach(() => {
    emitted = [];
    engine = new MiningGameEngine({
      characterId: cid, cityId: 'c', seed: 11, mapConfig: { mobSpawnCount: 0, gridHeight: 40, skyRows: 12 },
      socket: { connected: true, emit: (event: string, payload: any) => emitted.push({ event, payload }) } as any,
    });
    for (const id of [...engine.activeMobs.keys()]) engine.activeMobs.delete(id);
    for (let y = engine.surfaceRow; y < engine.grid.length; y++) for (let x = 0; x < engine.grid[0].length; x++) engine.fluidSubsystem.grid.setCell(x, y, 0, 0);
    for (let y = engine.surfaceRow; y < engine.grid.length; y++) {
      for (let x = 0; x < engine.grid[0].length; x++) {
        engine.grid[y][x] = { type: MiningTileType.DIRT, revealed: false };
        engine.gasSubsystem.onTileChanged(x, y);
        engine.rigidWorld.addTileCollider(x, y);
      }
    }
    vi.spyOn(engine.dataManager, 'getItemData').mockImplementation((id: string) => ({ id, weight: { dirt: 1, ore: 4 }[id] ?? 0 }) as any);
    me().playerBody.isGrounded = true;
  });

  it('does nothing while the player is away from the belt', () => {
    dig(4);
    give('ore', 5);
    away();
    tickFor(2);
    expect(packOf('ore')).toBe(5);
    expect(belt().items).toHaveLength(0);
  });

  it('unloads one item at a time at the unload rate while the player touches the belt', () => {
    dig(8);
    // (spacing is tested on its own below; the definition is shared by every room in the process, so it is put back)
    const spacing = def().beltItemSpacing;
    (def() as any).beltItemSpacing = 0.01;
    try {
      give('dirt', 100);
      onBelt(4);
      const rate = def().unloadItemsPerSecond;
      tickFor(1);
      const loaded = 100 - packOf('dirt');
      expect(loaded).toBeGreaterThanOrEqual(rate - 1);
      expect(loaded).toBeLessThanOrEqual(rate + 1);
      // and it stops when they step off
      away();
      const before = packOf('dirt');
      tickFor(1);
      expect(packOf('dirt')).toBe(before);
    } finally {
      (def() as any).beltItemSpacing = spacing;
    }
  });

  it('puts the heaviest item on first', () => {
    dig(4);
    give('dirt', 5);
    give('ore', 5);
    onBelt(2);
    tickFor(0.4);
    expect(belt().items.length).toBeGreaterThan(0);
    expect(belt().items[0].itemId).toBe('ore');
    expect(packOf('dirt')).toBe(5);
  });

  it('takes the item off the backpack as it goes on the belt, and keeps its owner', () => {
    dig(4);
    give('ore', 1);
    onBelt(2);
    tickFor(0.5);
    expect(packOf('ore')).toBe(0);
    expect(belt().items[0]).toMatchObject({ itemId: 'ore', ownerId: cid });
  });

  it('refuses an item where another is too close, so a busy belt backs up the unload', () => {
    dig(8);
    give('dirt', 50);
    onBelt(4);
    tickFor(1.5);
    // the player stays put, so every item they load is at the same spot: only one fits at a time
    const spacing = def().beltItemSpacing;
    const positions = belt().items.map((i) => i.pos).sort((a, b) => a - b);
    for (let i = 1; i < positions.length; i++) expect(positions[i] - positions[i - 1]).toBeGreaterThanOrEqual(spacing - 1e-6);
    expect(packOf('dirt')).toBeGreaterThan(30);
  });

  it('carries items up at the belt speed and puts them in the owner\'s stash when they arrive', () => {
    dig(6);
    give('ore', 1);
    onBelt(5);
    tickFor(0.3); // (one unit every 1/rate seconds)
    away();
    const item = belt().items[0];
    const start = item.pos;
    tickFor(0.5);
    expect(belt().items[0].pos).toBeCloseTo(start - def().beltSpeed * 0.5, 1);
    expect(stashOf('ore')).toBe(0); // not safe yet
    tickFor(start / def().beltSpeed + 0.3);
    expect(belt().items).toHaveLength(0);
    expect(stashOf('ore')).toBe(1);
  });

  it('an item that arrives after its owner left is saved straight to the database', () => {
    const writeStash = vi.fn();
    engine = new MiningGameEngine({
      characterId: cid, cityId: 'c', seed: 11, mapConfig: { mobSpawnCount: 0, gridHeight: 40, skyRows: 12 },
      socket: { connected: true, emit: () => {} } as any, writeStash,
    });
    for (let y = engine.surfaceRow; y < engine.grid.length; y++) for (let x = 0; x < engine.grid[0].length; x++) { engine.grid[y][x] = { type: MiningTileType.DIRT, revealed: false }; engine.rigidWorld.addTileCollider(x, y); }
    dig(4);
    belt().items.push({ id: 'x', itemId: 'ore', itemName: 'ore', iconUrl: null, ownerId: 'gone', pos: 0.1 });
    tickFor(0.2);
    expect(writeStash).toHaveBeenCalledWith('gone', [{ itemId: 'ore', quantity: 1 }]);
  });

  it('items on the belt are lost with the player: they never reach the stash', () => {
    dig(6);
    give('ore', 3);
    onBelt(5);
    tickFor(0.5);
    expect(belt().items.length).toBeGreaterThan(0);
    expect(me().stash).toEqual([]); // nothing is safe until it reaches the extractor
    engine.removePlayer(cid); // died, timed out or left
    expect(belt().items).toHaveLength(0);
    tickFor(3);
    expect(engine.players.size).toBe(0);
  });

  it('each player\'s items go to their own stash', () => {
    dig(6);
    engine.addPlayer({ characterId: 'other', socket: { connected: true, emit: () => {} } as any });
    give('ore', 1);
    give('dirt', 1, 'other');
    onBelt(5);
    tickFor(0.3);
    away();
    // (a body in the open shaft falls, so the second player steps on once the first item has moved on up)
    onBelt(5, 'other');
    tickFor(0.4);
    away('other');
    tickFor(5);
    expect(stashOf('ore')).toBe(1);
    expect(stashOf('dirt', 'other')).toBe(1);
    expect(stashOf('ore', 'other')).toBe(0);
  });

  it('only a landed extractor with a belt takes items', () => {
    give('ore', 2);
    onBelt(0);
    tickFor(1);
    expect(packOf('ore')).toBe(2);
    expect(belt().items).toHaveLength(0);
  });

  it('sends items as they go on and come off, and the whole belt in the join state', () => {
    dig(6);
    give('ore', 1);
    onBelt(5);
    emitted.length = 0;
    tickFor(0.35);
    const added = emitted.filter((e) => e.event === 'mining_state_tick').flatMap((e) => e.payload.beltItems?.added ?? []);
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({ itemId: 'ore', ownerId: cid });
    expect(belt().itemsSnapshot()).toHaveLength(1);
    away();
    emitted.length = 0;
    tickFor(5);
    const removed = emitted.filter((e) => e.event === 'mining_state_tick').flatMap((e) => e.payload.beltItems?.removed ?? []);
    expect(removed).toEqual([added[0].id]);
  });
});
