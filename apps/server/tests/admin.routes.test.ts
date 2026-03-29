import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { adminRouter } from '../src/routes/admin';

// Mock auth middleware to bypass auth during tests
vi.mock('../src/middleware/auth', () => ({
  adminMiddleware: (req: any, res: any, next: any) => next(),
  authenticateToken: (req: any, res: any, next: any) => next(),
}));

const app = express();
app.use(express.json());
app.use('/admin', adminRouter);

// Mock fs to prevent actual file writes
vi.mock('fs', () => ({
  default: { writeFileSync: vi.fn() }
}));

// Mock Prisma
const { mockDbOp } = vi.hoisted(() => ({
  mockDbOp: (mockData: any) => ({
    findMany: vi.fn().mockResolvedValue([mockData]),
    findUnique: vi.fn().mockResolvedValue(mockData),
    create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'new_id', ...data })),
    update: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'updated_id', ...data })),
    delete: vi.fn().mockResolvedValue({ success: true })
  })
}));

vi.mock('../src/index', () => ({
  prisma: {
    city: mockDbOp({ id: 'city_1', name: 'Test City' }),
    item: mockDbOp({ id: 'item_1', name: 'Test Item' }),
    mob: mockDbOp({ id: 'mob_1', name: 'Test Mob' }),
    dungeon: mockDbOp({ id: 'dungeon_1', name: 'Test Dungeon' }),
    dungeonLevel: mockDbOp({ id: 'level_1', name: 'Test Level' }),
    inventoryItem: mockDbOp({ id: 'inv_1', quantity: 5 }),
    user: mockDbOp({ id: 'user_1' })
  }
}));

describe('Admin API Routes', () => {

  const endpoints = [
    { path: '/admin/cities', data: { name: 'New City', description: 'A city' } },
    { path: '/admin/items', data: { name: 'New Item', description: 'An item', type: 'MATERIAL', subType: 'MINERAL', vendorBuyPrice: 0, vendorSellPrice: 0, userSellPrice: 0, userBuyPrice: 0, rarity: 'LOW' } },
    { path: '/admin/mobs', data: { name: 'New Mob', level: 1, health: 10, attack: 1, defense: 1 } },
    { path: '/admin/dungeons', data: { name: 'New Dungeon', description: 'A dungeon', cityId: 'city_1', minLevel: 1 } },
    { path: '/admin/dungeon-levels', data: { name: 'New Level' } },
    { path: '/admin/inventory-items', data: { characterId: 'char_1', itemId: 'item_1', quantity: 1 } }
  ];

  for (const { path, data } of endpoints) {
    describe(`Endpoint: ${path}`, () => {
      it('GET all - should return array', async () => {
        const res = await request(app).get(path);
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.length).toBeGreaterThan(0);
      });

      // Skip GET by ID for dungeon-levels as it's not strictly defined in routes right now
      if (path !== '/admin/dungeon-levels') {
        it('GET by ID - should return single record', async () => {
             const res = await request(app).get(`${path}/test_id`);
             expect(res.status).toBe(200);
             expect(res.body).toHaveProperty('id');
        });
      }

      it('POST - should create new object', async () => {
        const res = await request(app).post(path).send(data);
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('id', 'new_id');
      });

      it('PUT - should edit existing object', async () => {
        const res = await request(app).put(`${path}/test_id`).send(data);
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('id', 'updated_id');
      });
      
      // We only have strict DELETE for a few, but we can test if it's there
      if (path === '/admin/dungeon-levels' || path === '/admin/inventory-items') {
        it('DELETE - should remove object', async () => {
          const res = await request(app).delete(`${path}/test_id`);
          expect(res.status).toBe(200);
          expect(res.body).toHaveProperty('success', true);
        });
      }
    });
  }

  describe('DropTable Payload Mapping', () => {
    it('maps dropTable for /admin/mobs POST', async () => {
       const dropTable = { solMin: 10, solMax: 20, items: [{ itemId: 'item_1', chance: 50, minQuantity: 1, maxQuantity: 2 }] };
       const res = await request(app).post('/admin/mobs').send({
         name: 'DropTable Mob', level: 1, health: 10, attack: 1, defense: 1,
         dropTable
       });
       expect(res.status).toBe(200);
       expect(res.body.dropTable).toBeDefined();
       expect(res.body.dropTable.create.solMin).toBe(10);
       expect(res.body.dropTable.create.items.create[0].itemId).toBe('item_1');
    });

    it('maps completionDropTable and mobs for /admin/dungeon-levels POST', async () => {
       const completionDropTable = { solMin: 100, solMax: 200, items: [] };
       const mobs = [{ mobId: 'mob_x', dropTable: { solMin: 5, solMax: 10, items: [] } }];
       const res = await request(app).post('/admin/dungeon-levels').send({
         name: 'Boss Level', dungeonId: 'dungeon_1', orderIndex: 1,
         completionDropTable, mobs
       });
       expect(res.status).toBe(200);
       expect(res.body.completionDropTable.create.solMin).toBe(100);
       expect(res.body.mobs.create[0].mobId).toBe('mob_x');
       expect(res.body.mobs.create[0].dropTable.create.solMin).toBe(5);
    });
  });
});
