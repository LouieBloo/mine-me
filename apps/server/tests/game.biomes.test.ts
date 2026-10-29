import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../src/middleware/auth', () => ({
  authenticateToken: (_req: any, _res: any, next: any) => next(),
}));
vi.mock('../src/index', () => ({ prisma: {} }));

const { getBiomes } = vi.hoisted(() => ({ getBiomes: vi.fn() }));
vi.mock('../src/services/mining/subsystems/MiningDataManager', () => ({
  MiningDataManager: { getInstance: () => ({ getBiomes }) },
}));

import { gameRouter } from '../src/routes/game';

const app = express();
app.use('/game', gameRouter);

describe('GET /game/biomes (ticket 144)', () => {
  beforeEach(() => getBiomes.mockReset());

  it('lists the loaded biomes by name, with nothing about how they generate', async () => {
    getBiomes.mockReturnValue([
      { key: 'frozen_caves', name: 'Frozen Caves', description: 'Cold', weight: 2, minDepth: 30, blockPalette: { weights: {} } },
      { key: 'clay_pits', name: 'Clay Pits' },
    ]);
    const res = await request(app).get('/game/biomes');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { key: 'clay_pits', name: 'Clay Pits', description: null },
      { key: 'frozen_caves', name: 'Frozen Caves', description: 'Cold' },
    ]);
  });

  it('is an empty list when no biomes are loaded', async () => {
    getBiomes.mockReturnValue([]);
    expect((await request(app).get('/game/biomes')).body).toEqual([]);
  });

  it('reports a failure instead of hanging', async () => {
    getBiomes.mockReturnValue(42); // (not a list: building the answer throws)
    const res = await request(app).get('/game/biomes');
    expect(res.status).toBe(500);
    expect(typeof res.body.error).toBe('string');
  });
});
