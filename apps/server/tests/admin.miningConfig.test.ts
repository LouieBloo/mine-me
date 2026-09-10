import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { adminRouter } from '../src/routes/admin';
import { DEFAULT_MINING_MAP_CONFIG } from '@mine-me/shared';

// Mock auth middleware
vi.mock('../src/middleware/auth', () => ({
  adminMiddleware: (req: any, res: any, next: any) => next(),
  authenticateToken: (req: any, res: any, next: any) => next(),
}));

let mockActiveConfig: any = null;

vi.mock('../src/index', () => ({
  prisma: {
    miningMapConfig: {
      findFirst: vi.fn().mockImplementation(() => Promise.resolve(mockActiveConfig)),
      create: vi.fn().mockImplementation(({ data }) => {
        mockActiveConfig = { id: 'cfg_1', ...data };
        return Promise.resolve(mockActiveConfig);
      }),
      update: vi.fn().mockImplementation(({ data }) => {
        mockActiveConfig = { ...mockActiveConfig, ...data };
        return Promise.resolve(mockActiveConfig);
      }),
    },
  },
}));

const app = express();
app.use(express.json());
app.use('/admin', adminRouter);

describe('Admin Mining Config API Routes', () => {
  beforeEach(() => {
    mockActiveConfig = null;
  });

  it('GET /admin/mining-config returns default config when database is empty', async () => {
    const res = await request(app).get('/admin/mining-config');
    expect(res.status).toBe(200);
    expect(res.body.cavernDensity).toBe(DEFAULT_MINING_MAP_CONFIG.cavernDensity);
    expect(res.body.tunnelCount).toBe(DEFAULT_MINING_MAP_CONFIG.tunnelCount);
  });

  it('PUT /admin/mining-config updates and saves new parameters', async () => {
    const res = await request(app)
      .put('/admin/mining-config')
      .send({
        cavernDensity: 50,
        tunnelCount: 8,
        rockPercentage: 15,
      });

    expect(res.status).toBe(200);
    expect(res.body.cavernDensity).toBe(50);
    expect(res.body.tunnelCount).toBe(8);
    expect(res.body.rockPercentage).toBe(15);
  });

  it('PUT /admin/mining-config rejects invalid values out of bounds', async () => {
    const res = await request(app)
      .put('/admin/mining-config')
      .send({
        cavernDensity: 150, // Max is 100
      });

    expect(res.status).toBe(400);
  });

  it('POST /admin/mining-config/preview returns 2D grid matrix and calculated metrics', async () => {
    const res = await request(app)
      .post('/admin/mining-config/preview')
      .send({
        seed: 12345,
        config: {
          cavernDensity: 40,
          tunnelCount: 5,
        },
      });

    expect(res.status).toBe(200);
    expect(res.body.seed).toBe(12345);
    expect(res.body.tiles).toBeDefined();
    expect(res.body.tiles.length).toBe(45);
    expect(res.body.tiles[0].length).toBe(45);
    expect(res.body.stats).toBeDefined();
    expect(res.body.stats.voidPercentage).toBeGreaterThanOrEqual(0);
    expect(res.body.stats.solidPercentage).toBeGreaterThan(0);
  });

  it('POST /admin/mining-config/reset restores default configuration', async () => {
    // First update to non-default
    await request(app)
      .put('/admin/mining-config')
      .send({ cavernDensity: 80, tunnelCount: 15 });

    // Then reset
    const res = await request(app).post('/admin/mining-config/reset');
    expect(res.status).toBe(200);
    expect(res.body.cavernDensity).toBe(DEFAULT_MINING_MAP_CONFIG.cavernDensity);
    expect(res.body.tunnelCount).toBe(DEFAULT_MINING_MAP_CONFIG.tunnelCount);
  });
});
