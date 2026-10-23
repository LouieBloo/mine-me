import { describe, it, expect, vi, beforeEach } from 'vitest';

type Row = { characterId: string; itemId: string; quantity: number };
const db = vi.hoisted(() => ({ rows: [] as Row[], inventory: new Map<string, number>(), failNext: false, xp: 0 }));

vi.mock('../src/index', () => {
  const runStash = {
    findMany: async ({ where }: any) => db.rows.filter((r) => r.characterId === where.characterId).map((r) => ({ ...r })),
    deleteMany: async ({ where }: any) => {
      db.rows = db.rows.filter((r) => r.characterId !== where.characterId);
    },
    upsert: async ({ where, create, update }: any) => {
      if (db.failNext) {
        db.failNext = false;
        throw new Error('db down');
      }
      const { characterId, itemId } = where.characterId_itemId;
      const row = db.rows.find((r) => r.characterId === characterId && r.itemId === itemId);
      if (row) row.quantity += update.quantity.increment;
      else db.rows.push({ ...create });
    },
  };
  const tx = { runStash, item: { findUnique: async ({ where }: any) => (where.id === 'ghost' ? null : { id: where.id, type: 'MATERIAL', experience: where.id === 'xp' ? 2 : 0 }) } };
  return {
    prisma: {
      runStash,
      $transaction: async (arg: any) => {
        const snapshot = JSON.stringify(db.rows);
        const inventory = new Map(db.inventory);
        try {
          if (db.failNext) {
            db.failNext = false;
            throw new Error('db down');
          }
          return Array.isArray(arg) ? await Promise.all(arg) : await arg(tx);
        } catch (err) {
          db.rows = JSON.parse(snapshot);
          db.inventory = inventory;
          throw err;
        }
      },
    },
  };
});
vi.mock('../src/services/inventory.service', () => ({
  InventoryService: {
    applyGrantsInTransaction: async (_tx: any, _characterId: string, merged: Map<string, number>, skipped: any[]) => {
      if (db.failNext) {
        db.failNext = false;
        throw new Error('grant failed');
      }
      const granted: any[] = [];
      let experienceGranted = 0;
      for (const [itemId, quantity] of merged) {
        if (itemId === 'ghost') {
          skipped.push({ itemId, quantity, reason: 'item not found' });
          continue;
        }
        db.inventory.set(itemId, (db.inventory.get(itemId) ?? 0) + quantity);
        if (itemId === 'xp') experienceGranted += 2 * quantity;
        granted.push({ itemId, quantity });
      }
      return { granted, experienceGranted };
    },
  },
}));
vi.mock('../src/services/character.service', () => ({ CharacterService: { addExperience: vi.fn(async (_id: string, xp: number) => { db.xp += xp; }) } }));

import { RunStashService } from '../src/services/runStash.service';

describe('RunStashService', () => {
  beforeEach(() => {
    db.rows = [];
    db.inventory = new Map();
    db.failNext = false;
    db.xp = 0;
  });

  it('adds deposits, merging a repeated item and ignoring bad quantities', async () => {
    await RunStashService.add('c1', [{ itemId: 'ore', quantity: 2 }, { itemId: 'ore', quantity: 3 }, { itemId: 'dirt', quantity: 0 }, { itemId: 'x', quantity: -1 }, { itemId: 'y', quantity: 1.5 }]);
    await RunStashService.add('c1', [{ itemId: 'ore', quantity: 1 }]);
    expect(await RunStashService.list('c1')).toEqual([{ itemId: 'ore', quantity: 6 }]);
  });

  it('keeps each character\'s stash separate', async () => {
    await RunStashService.add('c1', [{ itemId: 'ore', quantity: 2 }]);
    await RunStashService.add('c2', [{ itemId: 'ore', quantity: 9 }]);
    expect(await RunStashService.list('c1')).toEqual([{ itemId: 'ore', quantity: 2 }]);
    expect((await RunStashService.bank('c1')).stash).toEqual([{ itemId: 'ore', quantity: 2 }]);
    expect(await RunStashService.list('c2')).toEqual([{ itemId: 'ore', quantity: 9 }]);
    expect(db.inventory.get('ore')).toBe(2);
  });

  it('banks the stash and the backpack together and empties the stash', async () => {
    await RunStashService.add('c1', [{ itemId: 'ore', quantity: 4 }]);
    const result = await RunStashService.bank('c1', [{ itemId: 'ore', quantity: 1 }, { itemId: 'dirt', quantity: 7 }]);
    expect(db.inventory.get('ore')).toBe(5);
    expect(db.inventory.get('dirt')).toBe(7);
    expect(result.stash).toEqual([{ itemId: 'ore', quantity: 4 }]);
    expect(await RunStashService.list('c1')).toEqual([]);
  });

  it('is safe to bank twice: the second time banks nothing more', async () => {
    await RunStashService.add('c1', [{ itemId: 'ore', quantity: 4 }]);
    await RunStashService.bank('c1');
    await RunStashService.bank('c1');
    expect(db.inventory.get('ore')).toBe(4);
  });

  it('commits all or nothing: a failure leaves the stash in place to be banked later', async () => {
    await RunStashService.add('c1', [{ itemId: 'ore', quantity: 4 }]);
    db.failNext = true;
    await expect(RunStashService.bank('c1', [{ itemId: 'dirt', quantity: 1 }])).rejects.toThrow();
    expect(db.inventory.size).toBe(0);
    expect(await RunStashService.list('c1')).toEqual([{ itemId: 'ore', quantity: 4 }]);
    await RunStashService.bank('c1');
    expect(db.inventory.get('ore')).toBe(4);
  });

  it('waits for deposits still being written, in order', async () => {
    const writes = [
      RunStashService.add('c1', [{ itemId: 'ore', quantity: 1 }]),
      RunStashService.add('c1', [{ itemId: 'ore', quantity: 2 }]),
    ];
    const banked = RunStashService.bank('c1');
    await Promise.all(writes);
    expect((await banked).stash).toEqual([{ itemId: 'ore', quantity: 3 }]);
  });

  it('a failed write does not block the ones after it', async () => {
    db.failNext = true;
    await expect(RunStashService.add('c1', [{ itemId: 'ore', quantity: 1 }])).rejects.toThrow();
    await RunStashService.add('c1', [{ itemId: 'ore', quantity: 2 }]);
    expect(await RunStashService.list('c1')).toEqual([{ itemId: 'ore', quantity: 2 }]);
  });

  it('reports items it could not grant and still banks the rest', async () => {
    await RunStashService.add('c1', [{ itemId: 'ghost', quantity: 1 }, { itemId: 'ore', quantity: 1 }]);
    const result = await RunStashService.bank('c1');
    expect(result.skipped).toEqual([{ itemId: 'ghost', quantity: 1, reason: 'item not found' }]);
    expect(db.inventory.get('ore')).toBe(1);
  });

  it('grants experience for banked items after the commit', async () => {
    await RunStashService.add('c1', [{ itemId: 'xp', quantity: 3 }]);
    await RunStashService.bank('c1');
    expect(db.xp).toBe(6);
  });
});
