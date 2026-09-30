import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { adminRouter } from '../src/routes/admin';

// Mock auth middleware
vi.mock('../src/middleware/auth', () => ({
  adminMiddleware: (req: any, res: any, next: any) => next(),
  authenticateToken: (req: any, res: any, next: any) => next(),
}));

export const mockSyncJson = vi.fn();
vi.mock('../src/services/admin.service', () => ({
  syncJson: (...args: any[]) => mockSyncJson(...args),
  getPagination: () => ({ skip: 0, take: 50, where: {} }),
}));

let mockItems: any[] = [];

vi.mock('../src/index', () => ({
  prisma: {
    item: {
      findMany: vi.fn().mockImplementation(() => Promise.resolve([...mockItems])),
      findUnique: vi.fn().mockImplementation(({ where }) => {
        const found = mockItems.find((i) => i.id === where.id || (where.itemKey && i.itemKey === where.itemKey));
        return Promise.resolve(found || null);
      }),
      create: vi.fn().mockImplementation(({ data }) => {
        const created = {
          id: `item_${Date.now()}`,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          ...data,
        };
        mockItems.push(created);
        return Promise.resolve(created);
      }),
      update: vi.fn().mockImplementation(({ where, data }) => {
        const idx = mockItems.findIndex((i) => i.id === where.id);
        if (idx !== -1) {
          mockItems[idx] = { ...mockItems[idx], ...data, updatedAt: new Date().toISOString() };
          return Promise.resolve(mockItems[idx]);
        }
        return Promise.reject(new Error('Item not found'));
      }),
      delete: vi.fn().mockImplementation(({ where }) => {
        const idx = mockItems.findIndex((i) => i.id === where.id);
        if (idx !== -1) {
          const removed = mockItems.splice(idx, 1)[0];
          return Promise.resolve(removed);
        }
        return Promise.reject(new Error('Item not found'));
      }),
    },
  },
}));

const app = express();
app.use(express.json());
app.use('/admin', adminRouter);

describe('Item itemKey Semantic Key and Syncing', () => {
  beforeEach(() => {
    mockItems = [
      {
        id: 'item_dynamite_cuid',
        itemKey: 'dynamite',
        name: 'Dynamite',
        description: 'Go boom',
        type: 'CONSUMABLE',
        subType: 'DYNAMITE',
        vendorBuyPrice: 0,
        vendorSellPrice: 0,
        userSellPrice: 0,
        userBuyPrice: 0,
        rarity: 'LOW',
        throwable: true,
      },
    ];
    mockSyncJson.mockClear();
  });

  it('creates an item with a normalized itemKey and syncs items.json', async () => {
    const res = await request(app)
      .post('/admin/items')
      .send({
        name: 'Iron Ladder',
        itemKey: '  LADDER_IRON  ',
        description: 'Sturdy iron ladder',
        type: 'CONSUMABLE',
        subType: 'LADDER',
        vendorBuyPrice: 10,
        vendorSellPrice: 5,
        userSellPrice: 0,
        userBuyPrice: 0,
        rarity: 'LOW',
      });

    expect(res.status).toBe(200);
    expect(res.body.itemKey).toBe('ladder_iron');
    expect(res.body.name).toBe('Iron Ladder');
    expect(mockSyncJson).toHaveBeenCalledWith('items.json', expect.any(Array));
  });

  it('normalizes blank or empty string itemKey to null', async () => {
    const res = await request(app)
      .post('/admin/items')
      .send({
        name: 'Generic Rock',
        itemKey: '   ',
        description: 'Just a plain rock',
        type: 'MATERIAL',
        subType: 'MINERAL',
        vendorBuyPrice: 1,
        vendorSellPrice: 1,
        userSellPrice: 0,
        userBuyPrice: 0,
        rarity: 'LOW',
      });

    expect(res.status).toBe(200);
    expect(res.body.itemKey).toBeNull();
    expect(mockSyncJson).toHaveBeenCalledWith('items.json', expect.any(Array));
  });

  it('updates an existing item with a new itemKey and syncs items.json', async () => {
    const res = await request(app)
      .put('/admin/items/item_dynamite_cuid')
      .send({
        name: 'Dynamite Mk2',
        itemKey: 'dynamite_mk2',
        description: 'Bigger boom',
        type: 'CONSUMABLE',
        subType: 'DYNAMITE',
        vendorBuyPrice: 20,
        vendorSellPrice: 10,
        userSellPrice: 0,
        userBuyPrice: 0,
        rarity: 'MEDIUM',
      });

    expect(res.status).toBe(200);
    expect(res.body.itemKey).toBe('dynamite_mk2');
    expect(res.body.name).toBe('Dynamite Mk2');
    expect(mockSyncJson).toHaveBeenCalledWith('items.json', expect.any(Array));
  });
});
