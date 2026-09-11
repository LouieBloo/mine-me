import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { adminRouter } from '../src/routes/admin';
import { publicRouter } from '../src/routes/public';

// Mock auth middleware
vi.mock('../src/middleware/auth', () => ({
  adminMiddleware: (req: any, res: any, next: any) => next(),
  authenticateToken: (req: any, res: any, next: any) => next(),
}));

// Mock syncJson
vi.mock('../src/services/admin.service', async () => {
  const actual: any = await vi.importActual('../src/services/admin.service');
  return {
    ...actual,
    syncJson: vi.fn(),
  };
});

let mockParticleEffects: any[] = [];

vi.mock('../src/index', () => ({
  prisma: {
    particleEffect: {
      findMany: vi.fn().mockImplementation(() => Promise.resolve(mockParticleEffects)),
      findUnique: vi.fn().mockImplementation(({ where }) => {
        const found = mockParticleEffects.find(p => p.id === where.id);
        return Promise.resolve(found || null);
      }),
      create: vi.fn().mockImplementation(({ data }) => {
        const created = { id: 'pe_new', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), ...data };
        mockParticleEffects.push(created);
        return Promise.resolve(created);
      }),
      update: vi.fn().mockImplementation(({ where, data }) => {
        const idx = mockParticleEffects.findIndex(p => p.id === where.id);
        if (idx !== -1) {
          mockParticleEffects[idx] = { ...mockParticleEffects[idx], ...data, updatedAt: new Date().toISOString() };
          return Promise.resolve(mockParticleEffects[idx]);
        }
        return Promise.reject(new Error('Not found'));
      }),
      delete: vi.fn().mockImplementation(({ where }) => {
        const idx = mockParticleEffects.findIndex(p => p.id === where.id);
        if (idx !== -1) {
          const removed = mockParticleEffects.splice(idx, 1)[0];
          return Promise.resolve(removed);
        }
        return Promise.reject(new Error('Not found'));
      }),
    },
  },
}));

const app = express();
app.use(express.json());
app.use('/admin', adminRouter);
app.use('/api/public', publicRouter);

describe('Admin Particle Effects API Routes', () => {
  beforeEach(() => {
    mockParticleEffects = [
      {
        id: 'pe_torch_flame',
        name: 'Torch Flame',
        description: 'Rising fire sparks',
        type: 'CONTINUOUS',
        config: { emitterType: 'continuous', rate: 30 },
      },
      {
        id: 'pe_dirt_hit',
        name: 'Block Dirt Hit',
        description: 'Dirt dust burst',
        type: 'BURST',
        config: { emitterType: 'burst', burstCount: 15 },
      },
    ];
  });

  it('GET /admin/particle-effects returns list of effects', async () => {
    const res = await request(app).get('/admin/particle-effects');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(2);
    expect(res.body[0].name).toBe('Torch Flame');
  });

  it('GET /admin/particle-effects/:id returns single effect', async () => {
    const res = await request(app).get('/admin/particle-effects/pe_torch_flame');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('pe_torch_flame');
    expect(res.body.name).toBe('Torch Flame');
  });

  it('GET /admin/particle-effects/:id returns 404 for unknown ID', async () => {
    const res = await request(app).get('/admin/particle-effects/unknown_id');
    expect(res.status).toBe(404);
  });

  it('POST /admin/particle-effects validates and creates a new effect', async () => {
    const newEffect = {
      name: 'Sparkle Burst',
      description: 'Glitter sparkles',
      type: 'BURST',
      config: { emitterType: 'burst', burstCount: 25 },
    };

    const res = await request(app)
      .post('/admin/particle-effects')
      .send(newEffect);

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Sparkle Burst');
    expect(mockParticleEffects.length).toBe(3);
  });

  it('POST /admin/particle-effects fails validation if name is empty', async () => {
    const res = await request(app)
      .post('/admin/particle-effects')
      .send({
        name: '',
        type: 'BURST',
        config: {},
      });

    expect(res.status).toBe(400);
  });

  it('PUT /admin/particle-effects/:id updates an existing effect', async () => {
    const res = await request(app)
      .put('/admin/particle-effects/pe_torch_flame')
      .send({
        name: 'Enhanced Torch Flame',
        type: 'CONTINUOUS',
        config: { emitterType: 'continuous', rate: 45 },
      });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Enhanced Torch Flame');
    expect(res.body.config.rate).toBe(45);
  });

  it('DELETE /admin/particle-effects/:id removes an effect', async () => {
    const res = await request(app).delete('/admin/particle-effects/pe_torch_flame');
    expect(res.status).toBe(200);
    expect(mockParticleEffects.length).toBe(1);
  });

  it('GET /api/public/particle-effects returns public particle effects', async () => {
    const res = await request(app).get('/api/public/particle-effects');
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(2);
  });
});
