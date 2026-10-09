import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MINING_CONFIG, MiningTileType } from '@mine-me/shared';
import { MiningGameEngine } from '../MiningGameEngine';
import { MiningDataManager } from './MiningDataManager';

/** A room whose block/mob/item definitions are whatever the test says. */
function setup(blocks: any[] = [], items: any[] = [], mobs: any[] = []) {
  const original = MiningDataManager.getInstance();
  MiningDataManager.initialize({ items, mobs, blocks });
  const engine = new MiningGameEngine({ characterId: 'p', cityId: 'c', seed: 3, mapConfig: { mobSpawnCount: 0 }, socket: { connected: true, emit: vi.fn() } as any });
  for (const id of [...engine.activeMobs.keys()]) engine.activeMobs.delete(id);
  const restore = () =>
    MiningDataManager.initialize({ items: original.getItems(), mobs: (original as any).mobs, blocks: [...(original as any).blocksByTypeKey.values()] });
  return { engine, drops: engine.dropSubsystem, restore };
}

const chestWith = (entries: Array<{ itemId: string; chance: number; minQuantity: number; maxQuantity: number }>) => ({
  id: 'b-chest', typeKey: 'CHEST', health: 100, dropTable: { items: entries },
});
const entry = (itemId: string, chance = 100, min = 1, max = 1) => ({ itemId, chance, minQuantity: min, maxQuantity: max });

describe('dropped items', () => {
  let restore: () => void;
  afterEach(() => restore?.());

  describe('canonical item ids', () => {
    it('block drops store the canonical item id even when the drop table uses an itemKey', () => {
      const s = setup([chestWith([entry('sol', 100, 5, 5)])], [{ id: 'cuid-sol', itemKey: 'sol', name: 'Sol' }]);
      restore = s.restore;
      s.drops.spawnBlockDrops(5, 5, MiningTileType.CHEST);
      expect(s.drops.droppedItems).toHaveLength(1);
      expect(s.drops.droppedItems[0]).toMatchObject({ itemId: 'cuid-sol', itemName: 'Sol', quantity: 5 });
    });

    it('keeps the raw id when the item cannot be resolved', () => {
      const s = setup([chestWith([entry('mystery')])]);
      restore = s.restore;
      s.drops.spawnBlockDrops(5, 5, MiningTileType.CHEST);
      expect(s.drops.droppedItems[0].itemId).toBe('mystery');
    });

    it('mob drops (including Sol) store the canonical item id', () => {
      const s = setup([], [{ id: 'cuid-sol', itemKey: 'sol', name: 'Sol', type: 'CURRENCY', subType: 'SOL' }]);
      restore = s.restore;
      const mob = s.engine.spawnMob({ id: 'm', health: 10, dropTable: { solMin: 10, solMax: 10, items: [] } }, { x: 5, y: 5 });
      s.engine.mobSubsystem.spawnMobDrops(mob);
      expect(s.drops.droppedItems[0]).toMatchObject({ itemId: 'cuid-sol', quantity: 10 });
    });
  });

  describe('one spawn path for blocks and mobs', () => {
    it('spawnDrops places a batch around the origin, spread out, each with a physics body', () => {
      const s = setup();
      restore = s.restore;
      s.drops.spawnDrops([{ itemId: 'a', quantity: 1 }, { itemId: 'b', quantity: 2 }, { itemId: 'c', quantity: 3 }], { x: 10, y: 8 });
      const xs = s.drops.droppedItems.map((i) => i.position.x);
      expect(xs).toHaveLength(3);
      expect(new Set(xs).size).toBe(3); // spread out, not stacked
      expect(Math.min(...xs)).toBeCloseTo(9.75, 5);
      expect(Math.max(...xs)).toBeCloseTo(10.25, 5);
      expect(s.drops.droppedItems.every((i) => i.position.y === 8)).toBe(true);
      expect(s.drops.activeItemBodies.size).toBe(3);
      expect(s.drops.droppedItems.map((i) => i.quantity)).toEqual([1, 2, 3]);
    });

    it('a single drop is dropped exactly at the origin', () => {
      const s = setup();
      restore = s.restore;
      s.drops.spawnDrops([{ itemId: 'a', quantity: 1 }], { x: 3.5, y: 4.5 });
      expect(s.drops.droppedItems[0].position).toEqual({ x: 3.5, y: 4.5 });
    });

    it('flags the list as changed, gives every item a unique id, and ignores an empty batch', () => {
      const s = setup();
      restore = s.restore;
      s.drops.droppedItemsDirty = false;
      s.drops.spawnDrops([], { x: 1, y: 1 });
      expect(s.drops.droppedItemsDirty).toBe(false);
      s.drops.spawnDrops([{ itemId: 'a', quantity: 1 }, { itemId: 'a', quantity: 1 }], { x: 1, y: 1 });
      expect(s.drops.droppedItemsDirty).toBe(true);
      expect(new Set(s.drops.droppedItems.map((i) => i.id)).size).toBe(2);
    });

    it('blocks drop at the centre of their tile', () => {
      const s = setup([chestWith([entry('a')])]);
      restore = s.restore;
      s.drops.spawnBlockDrops(7, 9, MiningTileType.CHEST);
      expect(s.drops.droppedItems[0].position).toEqual({ x: 7.5, y: 9.5 });
    });

    it('mobs drop where they stand', () => {
      const s = setup();
      restore = s.restore;
      const mob = s.engine.spawnMob({ id: 'm', health: 10, dropTable: { items: [entry('a')] } }, { x: 12, y: 15 });
      s.engine.mobSubsystem.spawnMobDrops(mob);
      expect(s.drops.droppedItems[0].position.x).toBeCloseTo(mob.mobBody.position.x, 5);
      expect(s.drops.droppedItems[0].position.y).toBeCloseTo(mob.mobBody.position.y, 5);
    });
  });

  describe('which drops a block gives', () => {
    it('never drops from empty tiles or the entrance', () => {
      const s = setup([chestWith([entry('a')])]);
      restore = s.restore;
      s.drops.spawnBlockDrops(1, 1, MiningTileType.EMPTY);
      s.drops.spawnBlockDrops(1, 1, MiningTileType.ENTRANCE);
      expect(s.drops.droppedItems).toHaveLength(0);
    });

    it('rolls only the block table (its Sol range is not paid out)', () => {
      const s = setup([{ id: 'b', typeKey: 'CHEST', health: 100, dropTable: { items: [entry('a')], solMin: 50, solMax: 50 } }], [{ id: 'sol-id', itemKey: 'sol', name: 'Sol' }]);
      restore = s.restore;
      s.drops.spawnBlockDrops(1, 1, MiningTileType.CHEST);
      expect(s.drops.droppedItems.map((i) => i.itemId)).toEqual(['a']);
    });

    it('drops nothing for blocks with no drop table: there is no built-in loot', () => {
      const s2 = setup([{ id: 'm', typeKey: 'MINERAL', health: 100 }, { id: 'c', typeKey: 'CHEST', health: 100, dropTable: { items: [] } }]);
      restore = s2.restore;
      s2.drops.spawnBlockDrops(1, 1, MiningTileType.MINERAL);
      s2.drops.spawnBlockDrops(2, 1, MiningTileType.CHEST);
      expect(s2.drops.droppedItems).toHaveLength(0);
    });

    it('does not pay Sol without a currency item in the item table (no invented ids)', () => {
      const s2 = setup([], [{ id: 'gem', name: 'Gem' }]);
      restore = s2.restore;
      const mob = s2.engine.spawnMob({ id: 'm', health: 10, dropTable: { solMin: 10, solMax: 10, items: [] } }, { x: 5, y: 5 });
      s2.engine.mobSubsystem.spawnMobDrops(mob);
      expect(s2.drops.droppedItems).toHaveLength(0);
    });

    it('finds the currency by category, whatever its id or name', () => {
      const s2 = setup([], [{ id: 'gold-123', name: 'Gold Coins', type: 'CURRENCY', subType: 'SOL' }]);
      restore = s2.restore;
      const mob = s2.engine.spawnMob({ id: 'm', health: 10, dropTable: { solMin: 7, solMax: 7, items: [] } }, { x: 5, y: 5 });
      s2.engine.mobSubsystem.spawnMobDrops(mob);
      expect(s2.drops.droppedItems.map((i) => [i.itemId, i.quantity])).toEqual([['gold-123', 7]]);
    });

    it('drops nothing for other tiles without a table', () => {
      const s = setup([{ id: 'd', typeKey: 'DIRT', health: 100 }]);
      restore = s.restore;
      s.drops.spawnBlockDrops(1, 1, MiningTileType.DIRT);
      expect(s.drops.droppedItems).toHaveLength(0);
    });

    it('a 0% entry never drops and a 100% entry always does', () => {
      const s = setup([chestWith([entry('never', 0), entry('always', 100)])]);
      restore = s.restore;
      for (let i = 0; i < 50; i++) s.drops.spawnBlockDrops(1, 1, MiningTileType.CHEST);
      expect(new Set(s.drops.droppedItems.map((d) => d.itemId))).toEqual(new Set(['always']));
    });
  });

  describe('hard limit', () => {
    const fill = (drops: any, count: number) => {
      for (let i = 0; i < count; i++) {
        drops.droppedItems.push({ id: `old-${i}`, itemId: 'x', itemName: 'x', quantity: 1, position: { x: 1, y: 1 }, velocity: { x: 0, y: 0 } });
      }
    };
    const batch = (n: number) => Array.from({ length: n }, (_, i) => ({ itemId: `item-${i}`, quantity: 1 }));

    beforeEach(() => vi.spyOn(console, 'warn').mockImplementation(() => {}));
    afterEach(() => vi.restoreAllMocks());

    it('is 1000 items by default', () => {
      expect(MINING_CONFIG.MAX_DROPPED_ITEMS).toBe(1000);
    });

    it('spawns everything while under the limit', () => {
      const s = setup();
      restore = s.restore;
      fill(s.drops, MINING_CONFIG.MAX_DROPPED_ITEMS - 10);
      s.drops.spawnDrops(batch(3), { x: 5, y: 5 });
      expect(s.drops.droppedItems).toHaveLength(MINING_CONFIG.MAX_DROPPED_ITEMS - 7);
    });

    it('spawns only what fits, never evicts items already on the floor, and warns', () => {
      const s = setup();
      restore = s.restore;
      fill(s.drops, MINING_CONFIG.MAX_DROPPED_ITEMS - 2);
      s.drops.spawnDrops(batch(5), { x: 5, y: 5 });

      expect(s.drops.droppedItems).toHaveLength(MINING_CONFIG.MAX_DROPPED_ITEMS);
      expect(s.drops.droppedItems.slice(0, MINING_CONFIG.MAX_DROPPED_ITEMS - 2).every((i) => i.id!.startsWith('old-'))).toBe(true);
      expect(s.drops.activeItemBodies.size).toBe(2); // physics bodies only for the new ones
      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('limit'));
    });

    it('spawns nothing at the limit, and does not flag a change when nothing spawned', () => {
      const s = setup();
      restore = s.restore;
      fill(s.drops, MINING_CONFIG.MAX_DROPPED_ITEMS);
      s.drops.droppedItemsDirty = false;
      s.drops.spawnDrops(batch(4), { x: 5, y: 5 });
      expect(s.drops.droppedItems).toHaveLength(MINING_CONFIG.MAX_DROPPED_ITEMS);
      expect(s.drops.droppedItemsDirty).toBe(false);
    });

    it('logs the warning at most once per few seconds, not for every skipped drop', () => {
      const s = setup();
      restore = s.restore;
      fill(s.drops, MINING_CONFIG.MAX_DROPPED_ITEMS);
      for (let i = 0; i < 50; i++) s.drops.spawnDrops(batch(2), { x: 5, y: 5 });
      expect(console.warn).toHaveBeenCalledTimes(1);
    });

    it('mob drops respect the same limit', () => {
      const s = setup();
      restore = s.restore;
      fill(s.drops, MINING_CONFIG.MAX_DROPPED_ITEMS - 1);
      const mob = s.engine.spawnMob(
        { id: 'm', health: 10, dropTable: { solMin: 5, solMax: 5, items: [entry('a'), entry('b')] } },
        { x: 5, y: 5 }
      );
      s.engine.mobSubsystem.spawnMobDrops(mob);
      expect(s.drops.droppedItems).toHaveLength(MINING_CONFIG.MAX_DROPPED_ITEMS);
    });

    it('picking items up frees room for new drops', () => {
      const s = setup();
      restore = s.restore;
      fill(s.drops, MINING_CONFIG.MAX_DROPPED_ITEMS);
      s.drops.droppedItems.pop();
      s.drops.spawnDrops(batch(1), { x: 5, y: 5 });
      expect(s.drops.droppedItems).toHaveLength(MINING_CONFIG.MAX_DROPPED_ITEMS);
    });

    it('reserveDropSlots reports how many may be created', () => {
      const s = setup();
      restore = s.restore;
      expect(s.drops.reserveDropSlots(7)).toBe(7);
      fill(s.drops, MINING_CONFIG.MAX_DROPPED_ITEMS - 3);
      expect(s.drops.reserveDropSlots(7)).toBe(3);
      expect(s.drops.reserveDropSlots(0)).toBe(0);
    });
  });
});
