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

  it('PUT /admin/mining-config updates and saves new parameters including ore vein settings', async () => {
    const res = await request(app)
      .put('/admin/mining-config')
      .send({
        cavernDensity: 50,
        tunnelCount: 8,
        rockPercentage: 15,
        copperiumPercentage: 6,
        silveriumPercentage: 3,
        silveriumMinDepth: 15,
        oreClusterChance: 75,
      });

    expect(res.status).toBe(200);
    expect(res.body.cavernDensity).toBe(50);
    expect(res.body.tunnelCount).toBe(8);
    expect(res.body.rockPercentage).toBe(15);
    expect(res.body.copperiumPercentage).toBe(6);
    expect(res.body.silveriumPercentage).toBe(3);
    expect(res.body.silveriumMinDepth).toBe(15);
    expect(res.body.oreClusterChance).toBe(75);
  });

  it('PUT /admin/mining-config updates and saves rigid body physics parameters', async () => {
    const res = await request(app)
      .put('/admin/mining-config')
      .send({
        gravityEnabled: false,
        gravity: 35.5,
        dynamiteBounciness: 0.7,
        dynamiteFriction: 0.3,
        dynamiteThrowPower: 18.0,
        dynamiteFuseSeconds: 5.0,
        rockGravityScale: 1.5,
        rockRestitution: 0.2,
      });

    expect(res.status).toBe(200);
    expect(res.body.gravityEnabled).toBe(false);
    expect(res.body.gravity).toBe(35.5);
    expect(res.body.dynamiteBounciness).toBe(0.7);
    expect(res.body.dynamiteFriction).toBe(0.3);
    expect(res.body.dynamiteThrowPower).toBe(18.0);
    expect(res.body.dynamiteFuseSeconds).toBe(5.0);
    expect(res.body.rockGravityScale).toBe(1.5);
    expect(res.body.rockRestitution).toBe(0.2);
  });

  it('PUT /admin/mining-config rejects invalid values out of bounds', async () => {
    const res = await request(app)
      .put('/admin/mining-config')
      .send({
        cavernDensity: 150, // Max is 100
      });

    expect(res.status).toBe(400);
  });

  it('POST /admin/mining-config/preview returns 2D grid matrix and calculated metrics including ores', async () => {
    const res = await request(app)
      .post('/admin/mining-config/preview')
      .send({
        seed: 12345,
        config: {
          cavernDensity: 40,
          tunnelCount: 5,
          copperiumPercentage: 5,
          silveriumPercentage: 3,
          silveriumMinDepth: 10,
          oreClusterChance: 70,
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
    expect(res.body.stats.copperiumCount).toBeDefined();
    expect(res.body.stats.silveriumCount).toBeDefined();
    expect(res.body.stats.copperiumCount).toBeGreaterThan(0);
    expect(res.body.stats.silveriumCount).toBeGreaterThan(0);
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
