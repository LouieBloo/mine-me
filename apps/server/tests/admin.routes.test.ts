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
    delete: vi.fn().mockResolvedValue({ success: true }),
    count: vi.fn().mockResolvedValue(0)
  })
}));

vi.mock('../src/index', () => ({
  prisma: {
    city: mockDbOp({ id: 'city_1', name: 'Test City' }),
    item: mockDbOp({ id: 'item_1', name: 'Test Item', isStartingPiece: false, gearImageUrl: null }),
    mob: mockDbOp({ id: 'mob_1', name: 'Test Mob' }),
    inventoryItem: mockDbOp({ id: 'inv_1', quantity: 5 }),
    user: mockDbOp({ id: 'user_1' }),
    cityMaterial: mockDbOp({ id: 'cm_1', cityId: 'city_1', itemId: 'item_1', item: { id: 'item_1', name: 'Test Item' } })
  }
}));

describe('Admin API Routes', () => {

  const endpoints = [
    { path: '/admin/cities', data: { name: 'New City', description: 'A city' } },
    { path: '/admin/items', data: { name: 'New Item', description: 'An item', type: 'MATERIAL', subType: 'MINERAL', vendorBuyPrice: 0, vendorSellPrice: 0, userSellPrice: 0, userBuyPrice: 0, rarity: 'LOW' } },
    { path: '/admin/mobs', data: { name: 'New Mob', level: 1, health: 10, attack: 1, defense: 1 } },
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

  });

  describe('City Material Assignments', () => {
    it('GET /cities/:id/materials - should return array', async () => {
      const res = await request(app).get('/admin/cities/city_1/materials');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('POST /cities/:id/materials - should add material to city', async () => {
      const res = await request(app).post('/admin/cities/city_1/materials').send({ itemId: 'item_1' });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('id');
    });

    it('DELETE /cities/:id/materials/:cityMaterialId - should remove', async () => {
      const res = await request(app).delete('/admin/cities/city_1/materials/cm_1');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('success', true);
    });
  });
});
