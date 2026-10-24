import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { Prisma } from '@prisma/client';

vi.mock('../src/middleware/auth', () => ({
  adminMiddleware: (_req: any, _res: any, next: any) => next(),
  authenticateToken: (_req: any, _res: any, next: any) => next(),
}));

const { syncJson } = vi.hoisted(() => ({ syncJson: vi.fn() }));
vi.mock('../src/services/admin.service', async () => {
  const actual: any = await vi.importActual('../src/services/admin.service');
  return { ...actual, syncJson };
});
vi.mock('../src/services/mining/definitionReloader', () => ({ reloadDefinitions: vi.fn().mockResolvedValue({ ok: true }) }));

let rows: any[] = [];

vi.mock('../src/index', () => ({
  prisma: {
    biome: {
      findMany: vi.fn().mockImplementation(() => Promise.resolve([...rows].sort((a, b) => a.key.localeCompare(b.key)))),
      findFirst: vi.fn().mockImplementation(({ where }) =>
        Promise.resolve(rows.find((r) => where.OR.some((c: any) => c.id === r.id || c.key === r.key)) ?? null)
      ),
      findUnique: vi.fn().mockImplementation(({ where }) => Promise.resolve(rows.find((r) => r.key === where.key) ?? null)),
      count: vi.fn().mockImplementation(() => Promise.resolve(rows.length)),
      create: vi.fn().mockImplementation(({ data }) => {
        const row = { id: `biome_${rows.length + 1}`, ...data };
        rows.push(row);
        return Promise.resolve(row);
      }),
      update: vi.fn().mockImplementation(({ where, data }) => {
        const i = rows.findIndex((r) => r.id === where.id);
        rows[i] = { ...rows[i], ...data };
        return Promise.resolve(rows[i]);
      }),
      updateMany: vi.fn().mockImplementation(({ where, data }) => {
        rows = rows.map((r) => (r.isDefault === where.isDefault ? { ...r, ...data } : r));
        return Promise.resolve({});
      }),
      delete: vi.fn().mockImplementation(({ where }) => {
        rows = rows.filter((r) => r.id !== where.id);
        return Promise.resolve({});
      }),
    },
    fluid: { findMany: vi.fn().mockResolvedValue([{ typeKey: 'OIL' }]) },
    gas: { findMany: vi.fn().mockResolvedValue([{ typeKey: 'HYDROGEN' }]) },
    mob: { findMany: vi.fn().mockResolvedValue([{ id: 'mob_mole' }]) },
  },
}));

import { adminRouter } from '../src/routes/admin';
import { getAssetsRoot } from '../src/config/assetPaths';

const app = express();
app.use(express.json());
app.use('/admin', adminRouter);

const DEFAULT = { id: 'biome_default', key: 'default', name: 'Default', isDefault: true, minDepth: 0, maxDepth: null, weight: 1, noiseScale: 45 };
const FROZEN = {
  key: 'frozen_caves', name: 'Frozen Caves', minDepth: 30, maxDepth: 90, weight: 1.5, noiseScale: 40,
  blockPalette: { weights: { SILVERIUM: 2 }, swaps: [{ from: 'DIRT', to: 'LAVAROCK', chance: 0.5 }] },
  fluidWeights: { OIL: 0 }, gasWeights: { HYDROGEN: 2 }, mobSpawns: { mob_mole: 1 },
  ambient: { tint: '#99bbff' },
};

describe('admin biomes', () => {
  beforeEach(() => {
    rows = [{ ...DEFAULT }];
    syncJson.mockClear();
  });

  it('lists biomes by key and fetches one by id or key', async () => {
    rows.push({ ...DEFAULT, id: 'biome_x', key: 'alpha', isDefault: false });
    expect((await request(app).get('/admin/biomes')).body.map((b: any) => b.key)).toEqual(['alpha', 'default']);
    expect((await request(app).get('/admin/biomes/biome_default')).body.key).toBe('default');
    expect((await request(app).get('/admin/biomes/Default')).body.id).toBe('biome_default');
    expect((await request(app).get('/admin/biomes/nope')).status).toBe(404);
  });

  it('creates a biome with its tables and mirrors to biomes.json', async () => {
    const res = await request(app).post('/admin/biomes').send(FROZEN);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ key: 'frozen_caves', isDefault: false, fluidWeights: { OIL: 0 } });
    expect(syncJson).toHaveBeenCalledWith('biomes.json', expect.any(Array));
    expect(rows.find((r) => r.key === 'default')!.isDefault).toBe(true);
  });

  it('makes the first biome ever created the default', async () => {
    rows = [];
    const res = await request(app).post('/admin/biomes').send({ ...FROZEN, key: 'first' });
    expect(res.body.isDefault).toBe(true);
  });

  it('accepts numbers sent as strings (form fields)', async () => {
    const res = await request(app).post('/admin/biomes').send({ ...FROZEN, minDepth: '12', weight: '2' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ minDepth: 12, weight: 2 });
  });

  it('rejects an invalid biome with every problem listed and saves nothing', async () => {
    const res = await request(app).post('/admin/biomes').send({ ...FROZEN, key: 'Frozen Caves', minDepth: 100, fluidWeights: { OIL: -1 } });
    expect(res.status).toBe(400);
    expect(res.body.errors.length).toBe(3);
    expect(rows).toHaveLength(1);
    expect(syncJson).not.toHaveBeenCalled();
  });

  it('rejects a depth window where min is past max', async () => {
    const res = await request(app).post('/admin/biomes').send({ ...FROZEN, minDepth: 91 });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('minDepth cannot be greater than maxDepth');
  });

  it('rejects names of blocks, fluids, gases and mobs that do not exist', async () => {
    const res = await request(app).post('/admin/biomes').send({
      ...FROZEN,
      blockPalette: { weights: { NOPE: 2 }, swaps: [{ from: 'DIRT', to: 'GHOST' }] },
      fluidWeights: { WATERISH: 1 },
      gasWeights: { ARGON: 1 },
      mobSpawns: { mob_ghost: 1 },
    });
    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual(expect.arrayContaining([
      expect.stringContaining('unknown block: NOPE'),
      expect.stringContaining('unknown block: GHOST'),
      expect.stringContaining('unknown fluid: WATERISH'),
      expect.stringContaining('unknown gas: ARGON'),
      expect.stringContaining('unknown mob: mob_ghost'),
    ]));
  });

  it('rejects a duplicate key', async () => {
    const res = await request(app).post('/admin/biomes').send({ ...FROZEN, key: 'default' });
    expect(res.status).toBe(409);
  });

  it('a new default takes the role from the old one', async () => {
    const res = await request(app).post('/admin/biomes').send({ ...FROZEN, isDefault: true });
    expect(res.body.isDefault).toBe(true);
    expect(rows.filter((r) => r.isDefault).map((r) => r.key)).toEqual(['frozen_caves']);
  });

  it('updates a biome (PUT and PATCH), clearing a table with null', async () => {
    await request(app).post('/admin/biomes').send(FROZEN);
    const id = rows.find((r) => r.key === 'frozen_caves')!.id;
    const res = await request(app).patch(`/admin/biomes/${id}`).send({ weight: 3, fluidWeights: null });
    expect(res.status).toBe(200);
    expect(rows.find((r) => r.id === id)).toMatchObject({ weight: 3, fluidWeights: Prisma.JsonNull });
    expect((await request(app).put(`/admin/biomes/${id}`).send({ name: 'Ice' })).status).toBe(200);
    expect(rows.find((r) => r.id === id)!.name).toBe('Ice');
    // what was not mentioned stays
    expect(rows.find((r) => r.id === id)!.blockPalette).toEqual(FROZEN.blockPalette);
  });

  it('refuses an update that would leave the biome invalid, and changes nothing', async () => {
    await request(app).post('/admin/biomes').send(FROZEN);
    const id = rows.find((r) => r.key === 'frozen_caves')!.id;
    syncJson.mockClear();
    const res = await request(app).patch(`/admin/biomes/${id}`).send({ minDepth: 500 });
    expect(res.status).toBe(400);
    expect(rows.find((r) => r.id === id)!.minDepth).toBe(30);
    expect(syncJson).not.toHaveBeenCalled();
  });

  it('refuses to change a key, and allows sending the same key back', async () => {
    await request(app).post('/admin/biomes').send(FROZEN);
    const id = rows.find((r) => r.key === 'frozen_caves')!.id;
    expect((await request(app).put(`/admin/biomes/${id}`).send({ key: 'other' })).status).toBe(400);
    expect((await request(app).put(`/admin/biomes/${id}`).send({ ...FROZEN })).status).toBe(200);
  });

  it('makes another biome the default, and refuses to turn the only default off', async () => {
    await request(app).post('/admin/biomes').send(FROZEN);
    const id = rows.find((r) => r.key === 'frozen_caves')!.id;
    expect((await request(app).patch('/admin/biomes/biome_default').send({ isDefault: false })).status).toBe(400);
    expect((await request(app).patch(`/admin/biomes/${id}`).send({ isDefault: true })).status).toBe(200);
    expect(rows.filter((r) => r.isDefault).map((r) => r.key)).toEqual(['frozen_caves']);
  });

  it('404s when updating or deleting a biome that does not exist', async () => {
    expect((await request(app).put('/admin/biomes/zzz').send({ name: 'x' })).status).toBe(404);
    expect((await request(app).delete('/admin/biomes/zzz')).status).toBe(404);
  });

  it('deletes a biome and mirrors the change, but never the default', async () => {
    await request(app).post('/admin/biomes').send(FROZEN);
    const id = rows.find((r) => r.key === 'frozen_caves')!.id;
    const gone = await request(app).delete(`/admin/biomes/${id}`);
    expect(gone.status).toBe(200);
    expect(rows.map((r) => r.key)).toEqual(['default']);
    const refused = await request(app).delete('/admin/biomes/biome_default');
    expect(refused.status).toBe(400);
    expect(refused.body.error).toContain('default');
    expect(rows).toHaveLength(1);
  });
});

describe('biome preview', () => {
  const draft = { ...FROZEN, id: 'draft', isDefault: false };
  beforeEach(() => syncJson.mockClear());

  it('generates a strip with the biomes as sent, saving nothing', async () => {
    const res = await request(app).post('/admin/biomes/preview').send({ biomes: [draft], seed: 5, width: 60, height: 40 });
    expect(res.status).toBe(200);
    expect(res.body.width).toBe(60);
    expect(res.body.height).toBe(40);
    expect(res.body.tiles).toHaveLength(60 * 40);
    expect(res.body.biomeIndex).toHaveLength(60 * 40);
    expect(res.body.biomes.map((b: any) => b.key)).toEqual(['default', 'frozen_caves']);
    expect(new Set(res.body.biomeIndex)).toEqual(new Set([0, 1]));
    expect(syncJson).not.toHaveBeenCalled();
  });

  it('is the same for the same seed, and different for another', async () => {
    const send = (seed: number) => request(app).post('/admin/biomes/preview').send({ biomes: [draft], seed, width: 60, height: 40 });
    expect((await send(5)).body.tiles).toEqual((await send(5)).body.tiles);
    expect((await send(5)).body.tiles).not.toEqual((await send(6)).body.tiles);
  });

  it('keeps the size within limits and works with no biomes', async () => {
    const res = await request(app).post('/admin/biomes/preview').send({ width: 5000, height: 1 });
    expect(res.status).toBe(200);
    expect(res.body.width).toBe(200);
    expect(res.body.height).toBe(20);
    expect(res.body.biomes.map((b: any) => b.key)).toEqual(['default']);
  });

  it('rejects a draft that is not valid, naming it', async () => {
    const res = await request(app).post('/admin/biomes/preview').send({ biomes: [{ ...draft, weight: 0 }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('frozen_caves: weight');
  });
});

describe('biome wall texture upload', () => {
  const png = Buffer.from('89504e470d0a1a0a', 'hex');

  beforeEach(() => {
    rows = [{ ...DEFAULT, ambient: { tint: '#112233' } }];
    syncJson.mockClear();
  });

  it('saves the picture under the shared assets folder and keeps the rest of the look', async () => {
    const res = await request(app).post('/admin/biomes/biome_default/wall-texture').attach('texture', png, { filename: 'x.png', contentType: 'image/png' });
    expect(res.status).toBe(200);
    expect(res.body.ambient).toEqual({ tint: '#112233', wallTextureUrl: '/assets/sprites/biomes/biome_default-wall.png' });
    expect(fs.existsSync(path.join(getAssetsRoot(), 'sprites', 'biomes', 'biome_default-wall.png'))).toBe(true);
    expect(syncJson).toHaveBeenCalled();
  });

  it('rejects a missing file, a missing biome and a non-image', async () => {
    expect((await request(app).post('/admin/biomes/biome_default/wall-texture').send({})).status).toBe(400);
    expect((await request(app).post('/admin/biomes/ghost/wall-texture').attach('texture', png, { filename: 'x.png', contentType: 'image/png' })).status).toBe(404);
    const text = await request(app).post('/admin/biomes/biome_default/wall-texture').attach('texture', Buffer.from('hi'), { filename: 'x.txt', contentType: 'text/plain' });
    expect(text.status).toBeGreaterThanOrEqual(400);
  });
});
