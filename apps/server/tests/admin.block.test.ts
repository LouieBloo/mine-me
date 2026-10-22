import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { Prisma } from '@prisma/client';
import { adminRouter } from '../src/routes/admin';
import { publicRouter } from '../src/routes/public';

vi.mock('../src/middleware/auth', () => ({
  adminMiddleware: (req: any, res: any, next: any) => next(),
  authenticateToken: (req: any, res: any, next: any) => next(),
}));

vi.mock('../src/services/admin.service', async () => {
  const actual: any = await vi.importActual('../src/services/admin.service');
  return {
    ...actual,
    syncJson: vi.fn(),
  };
});

let mockBlocks: any[] = [];

vi.mock('../src/index', () => ({
  prisma: {
    miningBlock: {
      findMany: vi.fn().mockImplementation(() => Promise.resolve(mockBlocks)),
      findFirst: vi.fn().mockImplementation(({ where }) => {
        const found = mockBlocks.find(b =>
          b.id === where?.id ||
          b.typeKey === where?.typeKey ||
          (where?.OR && where.OR.some((cond: any) => b.id === cond.id || b.typeKey === cond.typeKey))
        );
        return Promise.resolve(found || null);
      }),
      update: vi.fn().mockImplementation(({ where, data }) => {
        const idx = mockBlocks.findIndex(b => b.id === where.id);
        if (idx !== -1) {
          mockBlocks[idx] = {
            ...mockBlocks[idx],
            ...data,
            updatedAt: new Date().toISOString(),
            idleParticleEffect: data.idleParticleEffectId ? { id: data.idleParticleEffectId, name: 'fairy_sparkle' } : null,
          };
          return Promise.resolve(mockBlocks[idx]);
        }
        return Promise.reject(new Error('Block not found'));
      }),
    },
  },
}));

const app = express();
app.use(express.json());
app.use('/admin', adminRouter);
app.use('/api/public', publicRouter);

describe('Mining Block Controller & Routes', () => {
  beforeEach(() => {
    mockBlocks = [
      {
        id: 'block_copperium',
        typeKey: 'COPPERIUM',
        name: 'Copperium Ore',
        description: 'Dense rock with copper veins',
        textureUrl: '/assets/mining/block_copperium-block.png',
        mineTimeMs: 1200,
        staminaCost: 1,
        idleParticleEffectId: 'pe_fairy_sparkle',
        idleParticleEffect: { id: 'pe_fairy_sparkle', name: 'fairy_sparkle' },
      },
      {
        id: 'block_dirt',
        typeKey: 'DIRT',
        name: 'Dirt',
        description: 'Standard dirt',
        textureUrl: '/assets/mining/block_dirt-block.jpg',
        mineTimeMs: 500,
        staminaCost: 1,
        idleParticleEffectId: null,
        idleParticleEffect: null,
      },
    ];
  });

  it('GET /admin/blocks returns list of blocks including idleParticleEffect', async () => {
    const res = await request(app).get('/admin/blocks');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(2);
    expect(res.body[0].idleParticleEffectId).toBe('pe_fairy_sparkle');
    expect(res.body[0].idleParticleEffect?.name).toBe('fairy_sparkle');
  });

  it('GET /admin/blocks/:id returns specific block with idleParticleEffect', async () => {
    const res = await request(app).get('/admin/blocks/block_copperium');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('block_copperium');
    expect(res.body.idleParticleEffectId).toBe('pe_fairy_sparkle');
  });

  it('PUT /admin/blocks/:id updates block idleParticleEffectId and properties', async () => {
    const res = await request(app)
      .put('/admin/blocks/block_dirt')
      .send({
        name: 'Magic Dirt',
        idleParticleEffectId: 'pe_fairy_sparkle',
        mineTimeMs: 600,
        staminaCost: 2,
      });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Magic Dirt');
    expect(res.body.idleParticleEffectId).toBe('pe_fairy_sparkle');
    expect(res.body.idleParticleEffect?.name).toBe('fairy_sparkle');
  });

  it('PUT /admin/blocks/:id allows clearing idleParticleEffectId to null', async () => {
    const res = await request(app)
      .put('/admin/blocks/block_copperium')
      .send({
        idleParticleEffectId: null,
      });

    expect(res.status).toBe(200);
    expect(res.body.idleParticleEffectId).toBeNull();
  });

  it('GET /api/public/blocks returns blocks with idleParticleEffect', async () => {
    const res = await request(app).get('/api/public/blocks');
    expect(res.status).toBe(200);
    expect(res.body[0].idleParticleEffectId).toBe('pe_fairy_sparkle');
  });

  it('PUT /admin/blocks/:id updates block dropTable', async () => {
    const res = await request(app)
      .put('/admin/blocks/block_dirt')
      .send({
        dropTable: {
          solMin: 0,
          solMax: 5,
          experience: 10,
          items: [
            { itemId: 'item_copper_ore', chance: 50, minQuantity: 1, maxQuantity: 2 },
          ],
        },
      });

    expect(res.status).toBe(200);
  });

  it('PUT /admin/blocks/:id updates block health dynamically', async () => {
    const res = await request(app)
      .put('/admin/blocks/block_dirt')
      .send({
        name: 'Hardened Dirt',
        health: 250,
        staminaCost: 2,
      });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Hardened Dirt');
    expect(res.body.health).toBe(250);
  });
});

describe('Mining Block flammability', () => {
  const BURNS = { ignitionChance: 0.5, spreadChance: 0.3, burnDuration: 6, heat: 2, burnsInto: 'DIRT', flameEffectId: 'pe1' };

  beforeEach(() => {
    mockBlocks = [{ id: 'block_dirt', typeKey: 'DIRT', name: 'Dirt', staminaCost: 1, idleParticleEffectId: null, idleParticleEffect: null }];
  });

  it('PUT /admin/blocks/:id saves how a block burns', async () => {
    const res = await request(app).put('/admin/blocks/block_dirt').send({ flammability: BURNS });
    expect(res.status).toBe(200);
    expect(mockBlocks[0].flammability).toEqual(BURNS);
  });

  it('turning it off clears the column with a database null, not a bare null', async () => {
    mockBlocks[0].flammability = BURNS;
    const res = await request(app).put('/admin/blocks/block_dirt').send({ flammability: null });
    expect(res.status).toBe(200);
    expect(mockBlocks[0].flammability).toBe(Prisma.JsonNull);
  });

  it('leaves it alone when the request does not mention it', async () => {
    mockBlocks[0].flammability = BURNS;
    await request(app).put('/admin/blocks/block_dirt').send({ name: 'Soil' });
    expect(mockBlocks[0].flammability).toEqual(BURNS);
  });

  it('rejects settings that do not make sense, listing the problems, and changes nothing', async () => {
    const res = await request(app).put('/admin/blocks/block_dirt').send({ flammability: { ignitionChance: 2, spreadChance: 0.3, burnDuration: 0, heat: 1 } });
    expect(res.status).toBe(400);
    expect(res.body.errors).toHaveLength(2);
    expect(mockBlocks[0].flammability).toBeUndefined();
  });
});

describe('Mining Block edge look (autotile, ticket 094)', () => {
  const LOOK = { radius: 0.3, rimColor: '#112233' };

  beforeEach(() => {
    mockBlocks = [{ id: 'block_dirt', typeKey: 'DIRT', name: 'Dirt', staminaCost: 1, idleParticleEffectId: null, idleParticleEffect: null }];
  });

  it('saves the block\'s own edge look', async () => {
    const res = await request(app).put('/admin/blocks/block_dirt').send({ autotile: LOOK });
    expect(res.status).toBe(200);
    expect(mockBlocks[0].autotile).toEqual(LOOK);
  });

  it('clears it with a database null, so the block falls back to the map look', async () => {
    mockBlocks[0].autotile = LOOK;
    const res = await request(app).put('/admin/blocks/block_dirt').send({ autotile: null });
    expect(res.status).toBe(200);
    expect(mockBlocks[0].autotile).toBe(Prisma.JsonNull);
  });

  it('leaves it alone when the request does not mention it', async () => {
    mockBlocks[0].autotile = LOOK;
    await request(app).put('/admin/blocks/block_dirt').send({ name: 'Soil' });
    expect(mockBlocks[0].autotile).toEqual(LOOK);
  });

  it('rejects values out of range, listing the problems, and changes nothing', async () => {
    const res = await request(app).put('/admin/blocks/block_dirt').send({ autotile: { radius: 2, rimColor: 'red' } });
    expect(res.status).toBe(400);
    expect(res.body.errors).toHaveLength(2);
    expect(mockBlocks[0].autotile).toBeUndefined();
  });
});
