import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { Prisma } from '@prisma/client';
import { adminRouter } from '../src/routes/admin';

vi.mock('../src/middleware/auth', () => ({
  adminMiddleware: (req: any, res: any, next: any) => next(),
  authenticateToken: (req: any, res: any, next: any) => next(),
}));
vi.mock('../src/services/admin.service', () => ({
  syncJson: vi.fn(),
  getPagination: () => ({ skip: 0, take: 50, where: {} }),
}));

let created: any[] = [];
let updated: any[] = [];

vi.mock('../src/index', () => ({
  prisma: {
    item: {
      findMany: vi.fn(async () => []),
      create: vi.fn(async ({ data }) => {
        created.push(data);
        return { id: 'item_new', ...data };
      }),
      update: vi.fn(async ({ where, data }) => {
        updated.push({ where, data });
        return { id: where.id, ...data };
      }),
    },
  },
}));

const app = express();
app.use(express.json());
app.use('/admin', adminRouter);

const base = {
  name: 'Flame Pickaxe',
  description: 'Burns',
  type: 'GEAR',
  subType: 'WEAPON',
  vendorBuyPrice: 0,
  vendorSellPrice: 0,
  userSellPrice: 0,
  userBuyPrice: 0,
  rarity: 'MEDIUM',
};

describe('Item held particle effect (admin save)', () => {
  beforeEach(() => {
    created = [];
    updated = [];
  });

  it('creates an item with a held effect and its origin', async () => {
    const res = await request(app)
      .post('/admin/items')
      .send({ ...base, heldParticleEffectId: 'pe_flame', heldParticleOffsetX: 12.5, heldParticleOffsetY: -30 });

    expect(res.status).toBe(200);
    expect(created[0]).toMatchObject({ heldParticleEffectId: 'pe_flame', heldParticleOffsetX: 12.5, heldParticleOffsetY: -30 });
  });

  it('updates and clears the held effect (null)', async () => {
    const res = await request(app)
      .put('/admin/items/item_1')
      .send({ ...base, heldParticleEffectId: null, heldParticleOffsetX: 0, heldParticleOffsetY: 0 });

    expect(res.status).toBe(200);
    expect(updated[0].data).toMatchObject({ heldParticleEffectId: null });
  });

  it('never passes a heldParticleEffect relation object to the database', async () => {
    await request(app)
      .put('/admin/items/item_1')
      .send({ ...base, heldParticleEffectId: 'pe_flame', heldParticleEffect: { id: 'pe_flame', name: 'Flame' }, particleEffect: null });
    await request(app).post('/admin/items').send({ ...base, heldParticleEffect: { id: 'x' } });

    expect(updated[0].data).not.toHaveProperty('heldParticleEffect');
    expect(created[0]).not.toHaveProperty('heldParticleEffect');
  });

  it.each([
    ['heldParticleOffsetX', 'far'],
    ['heldParticleOffsetY', 'up'],
    ['heldParticleEffectId', 42],
  ])('rejects a bad %s without saving', async (field, value) => {
    const res = await request(app).post('/admin/items').send({ ...base, [field]: value });
    expect(res.status).toBe(400);
    expect(created).toHaveLength(0);
  });
  describe('held light', () => {
    const lamp = { enabled: true, type: 'POINT', effect: 'FLICKER', color: '#ff8a2a', radius: 3, intensity: 0.6, offsetX: 10, offsetY: -20 };

    it('saves the held light config with the item, on create and update', async () => {
      await request(app).post('/admin/items').send({ ...base, heldLightConfig: lamp });
      await request(app).put('/admin/items/item_1').send({ ...base, heldLightConfig: lamp });
      expect(created[0].heldLightConfig).toEqual(lamp);
      expect(updated[0].data.heldLightConfig).toEqual(lamp);
    });

    it('clears it with null using the database null marker, not a bare null', async () => {
      await request(app).put('/admin/items/item_1').send({ ...base, heldLightConfig: null });
      await request(app).post('/admin/items').send({ ...base, heldLightConfig: null });
      expect(updated[0].data.heldLightConfig).toBe(Prisma.JsonNull);
      expect(created[0].heldLightConfig).toBe(Prisma.JsonNull);
    });

    it('rejects a held light that is not an object', async () => {
      const res = await request(app).post('/admin/items').send({ ...base, heldLightConfig: 'bright' });
      expect(res.status).toBe(400);
      expect(created).toHaveLength(0);
    });
  });
});
