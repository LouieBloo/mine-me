import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MiningTileType } from '@mine-me/shared';
import { MiningGameEngine } from './MiningGameEngine';
import { BELT_HAZARD_SECONDS } from './subsystems/MiningBeltSubsystem';

describe('damage to the conveyor belt (ticket 124)', () => {
  const cid = 'belt-dmg';
  let emitted: { event: string; payload: any }[];
  let engine: MiningGameEngine;
  const tickFor = (seconds: number) => { for (let i = 0; i < Math.round(seconds * 30); i++) (engine as any).tick(1 / 30); };
  const belt = () => engine.beltSubsystem!;
  const def = () => engine.extractorSubsystem!.definition;
  const me = () => engine.players.get(cid)!;
  const hit = (index: number, amount: number) => engine.damageSystem.applyDamage({ kind: 'belt', id: String(index) }, { amount, type: 'melee', source: { kind: 'environment', name: 'test' } });
  const dig = (rows: number) => { tickFor(def().landingSeconds + 0.1); tickFor(def().buildSecondsPerSegment * rows + 0.5); expect(belt().rows).toBeGreaterThanOrEqual(rows); };

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
    vi.spyOn(engine.dataManager, 'getItemData').mockImplementation((id: string) => ({ id, weight: 1 }) as any);
  });

  it('a segment has the health in the extractor definition, and a hit lowers it and its crack stage', () => {
    dig(4);
    expect(belt().segments[1]!.health).toBe(def().beltSegmentHealth);
    expect(belt().stageOf(1)).toBe(0);
    const result = hit(1, def().beltSegmentHealth * 0.3);
    expect(result).toMatchObject({ applied: true, killed: false });
    expect(belt().stageOf(1)).toBe(2);
    hit(1, def().beltSegmentHealth * 0.5);
    expect(belt().stageOf(1)).toBe(4);
  });

  it('a hit that uses up the health breaks the segment and cuts the line', () => {
    dig(5);
    const result = hit(2, def().beltSegmentHealth * 2);
    expect(result.killed).toBe(true);
    expect(belt().segments[2]).toBeNull();
    expect(belt().stageOf(2)).toBe(-1);
    expect(belt().firstBrokenRow).toBe(belt().startRow + 2);
    expect(belt().segments[1]).not.toBeNull();
  });

  it('ignores bad hits and hits on a segment that is not there', () => {
    dig(2);
    expect(hit(9, 50).applied).toBe(false);
    expect(hit(0, 0).applied).toBe(false);
    expect(hit(0, -5).applied).toBe(false);
    expect(hit(0, Number.NaN).applied).toBe(false);
    expect(belt().segments[0]!.health).toBe(def().beltSegmentHealth);
  });

  it('items riding below the break are lost; items above it carry on', () => {
    dig(8);
    belt().items.push({ id: 'low', itemId: 'ore', itemName: 'ore', iconUrl: null, ownerId: cid, pos: 6.5 });
    belt().items.push({ id: 'high', itemId: 'ore', itemName: 'ore', iconUrl: null, ownerId: cid, pos: 1.5 });
    hit(4, def().beltSegmentHealth * 2);
    expect(belt().items.map((i) => i.id)).toEqual(['high']);
    const lost = belt().takeItemChanges();
    expect(lost?.removed).toContain('low');
    tickFor(2);
    expect(me().stash.find((s) => s.itemId === 'ore')?.quantity).toBe(1); // only the item above the break arrived
  });

  it('refuses to put items on the belt below a break', () => {
    dig(8);
    me().temporaryBackpack.push({ itemId: 'ore', itemName: 'ore', iconUrl: null, quantity: 3 });
    me().playerBody.position = { x: belt().shaftX + 1.5, y: belt().startRow + 6 };
    hit(3, def().beltSegmentHealth * 2);
    tickFor(1);
    expect(belt().items).toHaveLength(0);
    expect(me().temporaryBackpack[0].quantity).toBe(3);
  });

  it('lays the broken segment again by itself, at the build rate, before it digs on', () => {
    dig(6);
    const rows = belt().rows;
    hit(2, def().beltSegmentHealth * 2);
    expect(belt().segments[2]).toBeNull();
    tickFor(def().buildSecondsPerSegment + 0.3);
    expect(belt().segments[2]).not.toBeNull();
    expect(belt().segments[2]!.health).toBe(def().beltSegmentHealth);
    expect(belt().rows).toBe(rows); // it mended before it dug further
    tickFor(def().buildSecondsPerSegment + 0.3);
    expect(belt().rows).toBe(rows + 1);
  });

  it('waits to rebuild while fluid or fire is in the gap', () => {
    dig(6);
    hit(2, def().beltSegmentHealth * 2);
    const row = belt().startRow + 2;
    vi.spyOn(engine.fireSubsystem, 'isBurning').mockImplementation((x, y) => x === belt().shaftX && y === row);
    tickFor(def().buildSecondsPerSegment * 3);
    expect(belt().segments[2]).toBeNull();
    expect(belt().blockedBy).toBe('fire');
  });

  it('fire in the shaft damages the segments it touches over time', () => {
    dig(6);
    const row = belt().startRow + 3;
    const burning = (x: number, y: number) => x === belt().shaftX && y === row;
    vi.spyOn(engine.fireSubsystem, 'isBurning').mockImplementation(burning);
    vi.spyOn(engine.fireSubsystem.grid, 'isBurning').mockImplementation(burning);
    vi.spyOn(engine.fireSubsystem.grid, 'burningCount', 'get').mockReturnValue(1);
    const before = belt().segments[3]!.health;
    tickFor(BELT_HAZARD_SECONDS * 4 + 0.1);
    expect(belt().segments[3]!.health).toBeLessThan(before);
    expect(belt().segments[0]!.health).toBe(def().beltSegmentHealth); // far from the fire
  });

  it('a harmful fluid (lava) breaks the segment it fills', () => {
    dig(4);
    const lava = { id: 'lava', typeKey: 'LAVA', name: 'Lava', contact: { damagePerSecond: def().beltSegmentHealth } } as any;
    vi.spyOn(engine.burningSubsystem, 'hazardRate').mockImplementation((box) => (Math.floor(box.y) === belt().startRow + 1 ? lava.contact.damagePerSecond * 10 : 0));
    tickFor(BELT_HAZARD_SECONDS + 0.1);
    expect(belt().segments[1]).toBeNull();
    expect(belt().segments[0]).not.toBeNull();
  });

  it('a blast hurts the segments in its radius, and the extractor is not a target', () => {
    dig(6);
    const centre = { x: belt().shaftX + 1.5, y: belt().startRow + 2.5 };
    engine.explodeDynamite({ id: 'd', position: centre, explosionRadius: 4, ownerId: cid } as any);
    expect(belt().segments[2]!.health).toBeLessThan(def().beltSegmentHealth);
    expect(engine.damageSystem.applyDamage({ kind: 'belt', id: 'extractor' }, { amount: 9999, type: 'melee', source: { kind: 'environment' } }).applied).toBe(false);
    expect(engine.extractorSubsystem!.definition.health).toBe(def().health);
  });

  it('a mob that attacks belts hits a segment in reach, with its Damage; one that does not leaves it alone', () => {
    dig(6);
    const mobData: any = { id: 'biter', name: 'Biter', health: 50, mobEffects: [], aiType: 'STATIONARY', aiConfig: { attacksBelt: true, attackRange: 3 } };
    const mob = (engine as any).mobSubsystem.spawnMob(mobData, { x: belt().shaftX + 1.5, y: belt().startRow + 2.5 });
    mob.stats = { ...mob.stats, weaponDamage: 30, miningSpeed: 100 };
    const apply = vi.spyOn(engine.damageSystem, 'applyDamage');
    tickFor(1);
    const hits = apply.mock.calls.filter(([target]) => target.kind === 'belt');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0][1].amount).toBe(30); // the mob's own Damage
    apply.mockClear();
    mob.attacksBelt = false;
    tickFor(1);
    expect(apply.mock.calls.filter(([target]) => target.kind === 'belt')).toHaveLength(0);
  });

  it('sends the stages when they change and which segments broke', () => {
    dig(6);
    emitted.length = 0;
    hit(2, def().beltSegmentHealth * 0.6);
    tickFor(0.1);
    let updates = emitted.filter((e) => e.event === 'mining_state_tick' && e.payload.belt).map((e) => e.payload.belt);
    expect(updates[0].stages[2]).toBe(3);
    expect(updates[0].broke).toBeUndefined();
    emitted.length = 0;
    hit(2, def().beltSegmentHealth);
    tickFor(0.1);
    updates = emitted.filter((e) => e.event === 'mining_state_tick' && e.payload.belt).map((e) => e.payload.belt);
    expect(updates[0].broke).toEqual([2]);
    expect(updates[0].stages[2]).toBe(-1);
    expect(belt().clientState().stages?.[2]).toBe(-1);
  });
});
