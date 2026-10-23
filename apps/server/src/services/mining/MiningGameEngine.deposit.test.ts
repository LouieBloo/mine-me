import { describe, it, expect, vi, afterEach } from 'vitest';
import { MiningGameEngine } from './MiningGameEngine';
import { STASH_FLUSH_SECONDS } from './subsystems/MiningExtractorSubsystem';

describe('handing the backpack to the extractor (ticket 121)', () => {
  afterEach(() => vi.restoreAllMocks());

  const cid = 'depositor';
  const writes: { characterId: string; items: { itemId: string; quantity: number }[] }[] = [];
  let engine: MiningGameEngine;
  let writeStash: ReturnType<typeof vi.fn>;
  const tickFor = (seconds: number) => { for (let i = 0; i < Math.round(seconds * 30); i++) (engine as any).tick(1 / 30); };
  const session = (id = cid) => engine.players.get(id)!;
  const stand = (where: 'at' | 'away', id = cid) => {
    const p = engine.extractorSubsystem!.placement;
    session(id).playerBody.position = where === 'at' ? { x: p.x + p.width / 2, y: engine.surfaceRow } : { x: 10, y: engine.surfaceRow };
  };
  const give = (itemId: string, quantity: number, id = cid) => session(id).temporaryBackpack.push({ itemId, itemName: itemId, iconUrl: null, quantity });
  const stashOf = (itemId: string, id = cid) => session(id).stash.find((s) => s.itemId === itemId)?.quantity ?? 0;
  const packOf = (itemId: string, id = cid) => session(id).temporaryBackpack.find((s) => s.itemId === itemId)?.quantity ?? 0;
  const land = () => tickFor(engine.extractorSubsystem!.definition.landingSeconds + 0.2);

  const make = () => {
    writes.length = 0;
    writeStash = vi.fn((characterId: string, items: any[]) => { writes.push({ characterId, items }); });
    engine = new MiningGameEngine({
      characterId: cid, cityId: 'c', seed: 11, mapConfig: { mobSpawnCount: 0 },
      socket: { connected: true, emit: () => {} } as any,
      writeStash: writeStash as any,
    });
    vi.spyOn(engine.dataManager, 'getItemData').mockImplementation((id: string) => ({ id, weight: { dirt: 1, ore: 4 }[id] ?? 0 }) as any);
    for (const id of [...engine.activeMobs.keys()]) engine.activeMobs.delete(id);
  };

  it('does nothing before the extractor has landed, or away from it', () => {
    make();
    give('ore', 10);
    stand('at');
    tickFor(0.5); // still landing
    expect(packOf('ore')).toBe(10);
    stand('away');
    land();
    tickFor(1);
    expect(packOf('ore')).toBe(10);
    expect(session().stash).toEqual([]);
  });

  it('moves the backpack into the stash at the deposit rate while the player stands at the extractor', () => {
    make();
    land();
    const rate = engine.extractorSubsystem!.definition.depositItemsPerSecond;
    give('dirt', 1000);
    stand('at');
    tickFor(1);
    expect(stashOf('dirt')).toBeGreaterThanOrEqual(rate - 2);
    expect(stashOf('dirt')).toBeLessThanOrEqual(rate + 1);
    expect(packOf('dirt') + stashOf('dirt')).toBe(1000);
    // and it stops when they walk away
    const before = stashOf('dirt');
    stand('away');
    tickFor(1);
    expect(stashOf('dirt')).toBe(before);
  });

  it('empties the pack heaviest item first, then stops when it is empty', () => {
    make();
    land();
    give('dirt', 30);
    give('ore', 30);
    stand('at');
    tickFor(1);
    expect(stashOf('ore')).toBeGreaterThan(0);
    expect(stashOf('dirt')).toBe(0);
    tickFor(5);
    expect(session().temporaryBackpack).toEqual([]);
    expect(stashOf('ore')).toBe(30);
    expect(stashOf('dirt')).toBe(30);
  });

  it('writes the deposits to the database as they land: within a second, and when they stop', () => {
    make();
    land();
    give('dirt', 1000);
    stand('at');
    tickFor(STASH_FLUSH_SECONDS + 0.3);
    expect(writeStash).toHaveBeenCalled();
    expect(writes[0].characterId).toBe(cid);
    const written = writes.flatMap((w) => w.items).reduce((n, i) => n + i.quantity, 0);
    expect(written).toBeGreaterThan(0);
    // step away: whatever is unsaved is written at once
    stand('away');
    tickFor(0.1);
    const writtenAfter = writes.flatMap((w) => w.items).reduce((n, i) => n + i.quantity, 0);
    expect(writtenAfter).toBe(stashOf('dirt'));
    expect(session().unsavedStash.size).toBe(0);
  });

  it('writes what is unsaved when the player leaves the room', () => {
    make();
    land();
    give('dirt', 100);
    stand('at');
    tickFor(0.3);
    const inStash = stashOf('dirt');
    expect(inStash).toBeGreaterThan(0);
    engine.removePlayer(cid);
    expect(writes.flatMap((w) => w.items).reduce((n, i) => n + i.quantity, 0)).toBe(inStash);
  });

  it('keeps deposits it could not save and tries again', async () => {
    make();
    land();
    writeStash.mockImplementationOnce(() => Promise.reject(new Error('db down')));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    give('dirt', 100);
    stand('at');
    tickFor(0.3);
    stand('away');
    tickFor(0.1);
    await Promise.resolve();
    await Promise.resolve();
    expect(session().unsavedStash.size).toBeGreaterThan(0);
    tickFor(0.1);
    expect(writes.flatMap((w) => w.items).reduce((n, i) => n + i.quantity, 0)).toBe(stashOf('dirt'));
  });

  it('keeps each player\'s stash separate', () => {
    make();
    engine.addPlayer({ characterId: 'other', socket: { connected: true, emit: () => {} } as any });
    land();
    give('ore', 10);
    give('dirt', 10, 'other');
    stand('at');
    stand('away', 'other');
    tickFor(2);
    expect(stashOf('ore')).toBe(10);
    expect(stashOf('dirt', 'other')).toBe(0);
    expect(packOf('dirt', 'other')).toBe(10);
  });

  it('a dead player deposits nothing, and a new world starts with an empty stash', () => {
    make();
    land();
    give('ore', 10);
    stand('at');
    session().isDead = true;
    tickFor(1);
    expect(stashOf('ore')).toBe(0);
    session().isDead = false;
    tickFor(1);
    expect(stashOf('ore')).toBeGreaterThan(0);
    engine.playerManager.resetForNewWorld(session());
    expect(session().stash).toEqual([]);
  });

  it('sends the stash in the tick when it changes, and only then', () => {
    const emitted: any[] = [];
    engine = new MiningGameEngine({ characterId: cid, cityId: 'c', seed: 11, mapConfig: { mobSpawnCount: 0 }, socket: { connected: true, emit: (e: string, p: any) => emitted.push({ e, p }) } as any });
    vi.spyOn(engine.dataManager, 'getItemData').mockImplementation((id: string) => ({ id, weight: 1 }) as any);
    land();
    give('dirt', 5);
    stand('at');
    tickFor(1);
    const withStash = emitted.filter((x) => x.e === 'mining_state_tick' && x.p.stash);
    expect(withStash.length).toBeGreaterThan(0);
    expect(withStash[withStash.length - 1].p.stash[0]).toMatchObject({ itemId: 'dirt', quantity: 5 });
    emitted.length = 0;
    tickFor(0.5);
    expect(emitted.filter((x) => x.e === 'mining_state_tick' && x.p.stash)).toHaveLength(0);
  });
});
