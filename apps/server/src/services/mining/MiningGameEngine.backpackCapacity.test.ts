import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MiningTileType, MINING_CONFIG, BASE_CARRY_CAPACITY } from '@mine-me/shared';
import { MiningGameEngine } from './MiningGameEngine';

describe('picking up items under a carry capacity (ticket 118)', () => {
  afterEach(() => vi.restoreAllMocks());

  const cid = 'backpack-cap';
  let engine: MiningGameEngine;
  let emitted: any[];
  const session = () => engine.players.get(cid)!;
  const carried = (itemId: string) => session().temporaryBackpack.find((b) => b.itemId === itemId)?.quantity ?? 0;
  const dropAt = (itemId: string, quantity: number) => {
    const p = session().playerBody.position;
    engine.droppedItems.push({ id: `d_${itemId}_${engine.droppedItems.length}`, position: { x: p.x, y: p.y }, itemId, itemName: itemId, iconUrl: null, quantity });
  };
  const pickUp = () => engine.dropSubsystem.checkItemPickupsForPlayer(session());
  const tick = () => (engine as any).tick(1 / 30);

  beforeEach(() => {
    emitted = [];
    engine = new MiningGameEngine({
      characterId: cid, cityId: 'c', seed: 3, mapConfig: { mobSpawnCount: 0 },
      socket: { connected: true, emit: (event: string, payload: any) => emitted.push({ event, payload }) } as any,
    });
    for (const id of [...engine.activeMobs.keys()]) engine.activeMobs.delete(id);
    engine.droppedItems.length = 0;
    vi.spyOn(engine.dataManager, 'getItemData').mockImplementation(
      (id: string) => ({ id, weight: { dirt: 1, ore: 4, feather: 0 }[id] }) as any
    );
    session().carryCapacity = 10;
  });

  it('picks up a stack that fits entirely', () => {
    dropAt('dirt', 10);
    pickUp();
    expect(carried('dirt')).toBe(10);
    expect(engine.droppedItems).toEqual([]);
  });

  it('leaves a stack on the ground when nothing of it fits', () => {
    session().temporaryBackpack.push({ itemId: 'dirt', itemName: 'dirt', iconUrl: null, quantity: 10 });
    dropAt('dirt', 3);
    pickUp();
    expect(carried('dirt')).toBe(10);
    expect(engine.droppedItems).toHaveLength(1);
    expect(engine.droppedItems[0].quantity).toBe(3);
  });

  it('takes what fits of a stack and leaves the rest as a smaller drop', () => {
    session().temporaryBackpack.push({ itemId: 'dirt', itemName: 'dirt', iconUrl: null, quantity: 6 });
    dropAt('ore', 3); // 4 each, 4 left: one fits
    pickUp();
    expect(carried('ore')).toBe(1);
    expect(engine.droppedItems).toHaveLength(1);
    expect(engine.droppedItems[0].quantity).toBe(2);
    expect(session().backpackDirty).toBe(true);
  });

  it('weightless items are always picked up, even in a full pack', () => {
    session().temporaryBackpack.push({ itemId: 'dirt', itemName: 'dirt', iconUrl: null, quantity: 10 });
    dropAt('feather', 50);
    pickUp();
    expect(carried('feather')).toBe(50);
  });

  it('a new item is refused without a pickup sound when none fits', () => {
    session().temporaryBackpack.push({ itemId: 'dirt', itemName: 'dirt', iconUrl: null, quantity: 10 });
    dropAt('dirt', 1);
    pickUp();
    expect(engine.dropSubsystem.takePickups()).toEqual([]);
  });

  it('asks for one "backpack full" notice, then waits out the cooldown while the player stands on the item', () => {
    session().temporaryBackpack.push({ itemId: 'dirt', itemName: 'dirt', iconUrl: null, quantity: 10 });
    dropAt('dirt', 1);
    pickUp();
    expect(session().backpackFullPending).toBe(true);
    session().backpackFullPending = false;
    pickUp(); // next tick, same item
    expect(session().backpackFullPending).toBe(false);
    session().backpackFullCooldown = 0;
    pickUp();
    expect(session().backpackFullPending).toBe(true);
  });

  it('the state tick carries weight, capacity and the full flag once', () => {
    session().temporaryBackpack.push({ itemId: 'dirt', itemName: 'dirt', iconUrl: null, quantity: 10 });
    session().backpackDirty = true;
    dropAt('dirt', 1);
    pickUp();
    tick();
    const first = emitted.filter((e) => e.event === 'mining_state_tick').pop().payload;
    expect(first.backpackWeight).toBe(10);
    expect(first.backpackCapacity).toBe(10);
    expect(first.backpackFull).toBe(true);
    tick();
    const second = emitted.filter((e) => e.event === 'mining_state_tick').pop().payload;
    expect(second.backpackFull).toBeUndefined();
    expect(second.backpackWeight).toBeUndefined();
  });

  it('a session starts with the base capacity, and a loadout change updates it', () => {
    const fresh = new MiningGameEngine({ characterId: 'x', cityId: 'c', seed: 3, mapConfig: { mobSpawnCount: 0 }, socket: { connected: true, emit: () => {} } as any });
    expect(fresh.players.get('x')!.carryCapacity).toBe(BASE_CARRY_CAPACITY);
    fresh.setLoadout('x', { miningSpeed: 0, toolDamage: 1, weaponDamage: 1, pickPower: 0, knockback: 0, gearLayers: [], equippedWeaponId: null, carryCapacity: 150 });
    expect(fresh.players.get('x')!.carryCapacity).toBe(150);
  });

  it('has a notice cooldown configured', () => {
    expect(MINING_CONFIG.BACKPACK_FULL_NOTICE_COOLDOWN_SECONDS).toBeGreaterThan(0);
    expect(MiningTileType.DIRT).toBeDefined();
  });
});
