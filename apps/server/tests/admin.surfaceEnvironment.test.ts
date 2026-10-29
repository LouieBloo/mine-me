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
const DOODADS = [{ key: 'oak_tree', anchor: 'FLOOR' }, { key: 'bird', anchor: 'AIR' }, { key: 'moss', anchor: 'WALL' }];

const plain = (row: any) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, v === Prisma.JsonNull ? null : v]));

vi.mock('../src/index', () => ({
  prisma: {
    surfaceEnvironment: {
      findMany: vi.fn().mockImplementation(() => Promise.resolve([...rows].sort((a, b) => a.key.localeCompare(b.key)).map(plain))),
      findFirst: vi.fn().mockImplementation(({ where }) => {
        const row = rows.find((r) => where.OR.some((c: any) => c.id === r.id || c.key === r.key));
        return Promise.resolve(row ? plain(row) : null);
      }),
      findUnique: vi.fn().mockImplementation(({ where }) => Promise.resolve(rows.find((r) => r.key === where.key) ?? null)),
      count: vi.fn().mockImplementation(() => Promise.resolve(rows.length)),
      updateMany: vi.fn().mockImplementation(({ where, data }) => {
        rows = rows.map((r) => (r.isDefault === where.isDefault ? { ...r, ...data } : r));
        return Promise.resolve({});
      }),
      create: vi.fn().mockImplementation(({ data }) => {
        const row = { id: `env_${rows.length + 1}`, ...data };
        rows.push(row);
        return Promise.resolve(plain(row));
      }),
      update: vi.fn().mockImplementation(({ where, data }) => {
        const i = rows.findIndex((r) => r.id === where.id);
        rows[i] = { ...rows[i], ...data };
        return Promise.resolve(plain(rows[i]));
      }),
      delete: vi.fn().mockImplementation(({ where }) => {
        rows = rows.filter((r) => r.id !== where.id);
        return Promise.resolve({});
      }),
    },
    doodad: { findMany: vi.fn().mockImplementation(() => Promise.resolve(DOODADS)) },
  },
}));

import { adminRouter } from '../src/routes/admin';
import { getAssetsRoot } from '../src/config/assetPaths';

const app = express();
app.use(express.json());
app.use('/admin', adminRouter);

const VALLEY = {
  key: 'green_valley',
  name: 'Green Valley',
  weight: 2,
  sky: { top: '#2f8fd8', horizon: '#9fd6ff', sunColor: '#fff2b0', sunX: 0.7, sunHeight: 20, sunSize: 3 },
  ambientTint: '#fff4e0',
  layers: [{ name: 'far mountains', parallaxFactor: 0.85, yOffset: 0, shape: 'mountains', height: 40, tint: '#8fa8c8' }],
  clouds: { maxCount: 10 },
  weather: { clear: 3, cloudy: 2, rain: 1 },
  props: [{ doodadKey: 'oak_tree', density: 6, spacing: 4 }, { doodadKey: 'bird', density: 2, minHeight: 6, maxHeight: 20 }],
};

describe('admin surface environments', () => {
  beforeEach(() => {
    rows = [];
    syncJson.mockClear();
  });

  it('creates an environment, answers in the shared shape and mirrors to surface_environments.json', async () => {
    const res = await request(app).post('/admin/surface-environments').send(VALLEY);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ key: 'green_valley', weight: 2, isDefault: true, sky: { top: '#2f8fd8' }, weather: { clear: 3, cloudy: 2, rain: 1 } });
    expect(res.body.props).toHaveLength(2);
    expect(syncJson).toHaveBeenCalledWith('surface_environments.json', [expect.objectContaining({ key: 'green_valley' })]);
  });

  it('makes the first one the default and moves the role when another asks for it', async () => {
    await request(app).post('/admin/surface-environments').send(VALLEY);
    const second = await request(app).post('/admin/surface-environments').send({ ...VALLEY, key: 'snowfield', name: 'Snowfield' });
    expect(second.body.isDefault).toBe(false);
    const third = await request(app).post('/admin/surface-environments').send({ ...VALLEY, key: 'desert', name: 'Desert', isDefault: true });
    expect(third.body.isDefault).toBe(true);
    expect(rows.filter((r) => r.isDefault)).toHaveLength(1);
    expect(rows.find((r) => r.isDefault).key).toBe('desert');
  });

  it('rejects an invalid environment with every problem listed and saves nothing', async () => {
    const res = await request(app).post('/admin/surface-environments').send({ key: 'Bad Key', name: '', weight: 0, sky: { top: 'blue', horizon: '#9fd6ff' }, layers: [{ name: 'x', parallaxFactor: 3, yOffset: 0 }] });
    expect(res.status).toBe(400);
    expect(res.body.errors.length).toBeGreaterThanOrEqual(5);
    expect(rows).toHaveLength(0);
  });

  it('rejects props that name a missing doodad, or one that hangs on a wall', async () => {
    const missing = await request(app).post('/admin/surface-environments').send({ ...VALLEY, props: [{ doodadKey: 'ghost', density: 2 }] });
    expect(missing.status).toBe(400);
    expect(missing.body.error).toMatch(/unknown doodad: ghost/);
    const wall = await request(app).post('/admin/surface-environments').send({ ...VALLEY, props: [{ doodadKey: 'moss', density: 2 }] });
    expect(wall.status).toBe(400);
    expect(wall.body.error).toMatch(/hangs on a ceiling or wall/);
    expect(rows).toHaveLength(0);
  });

  it('refuses a duplicate key', async () => {
    await request(app).post('/admin/surface-environments').send(VALLEY);
    expect((await request(app).post('/admin/surface-environments').send(VALLEY)).status).toBe(409);
  });

  it('lists by key, and fetches one by id or key', async () => {
    await request(app).post('/admin/surface-environments').send({ ...VALLEY, key: 'zz' });
    await request(app).post('/admin/surface-environments').send({ ...VALLEY, key: 'aa' });
    expect((await request(app).get('/admin/surface-environments')).body.map((e: any) => e.key)).toEqual(['aa', 'zz']);
    expect((await request(app).get('/admin/surface-environments/aa')).body.key).toBe('aa');
    expect((await request(app).get(`/admin/surface-environments/${rows[0].id}`)).body.key).toBe('zz');
    expect((await request(app).get('/admin/surface-environments/nope')).status).toBe(404);
  });

  it('updates what is sent, validates the merged result, and refuses a key change', async () => {
    await request(app).post('/admin/surface-environments').send(VALLEY);
    const id = rows[0].id;
    const ok = await request(app).patch(`/admin/surface-environments/${id}`).send({ weather: { storm: 1 }, name: ' Valley ' });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ name: 'Valley', weather: { storm: 1 } });
    expect((await request(app).patch(`/admin/surface-environments/${id}`).send({ weather: { hail: 1 } })).status).toBe(400);
    expect((await request(app).patch(`/admin/surface-environments/${id}`).send({ key: 'other' })).status).toBe(400);
    expect(rows[0].weather).toEqual({ storm: 1 });
  });

  it('keeps one default: it cannot be switched off or deleted', async () => {
    await request(app).post('/admin/surface-environments').send(VALLEY);
    const id = rows[0].id;
    expect((await request(app).patch(`/admin/surface-environments/${id}`).send({ isDefault: false })).status).toBe(400);
    expect((await request(app).delete(`/admin/surface-environments/${id}`)).status).toBe(400);
    expect(rows).toHaveLength(1);
  });

  it('deletes a non-default environment and mirrors the change; 404s when it does not exist', async () => {
    await request(app).post('/admin/surface-environments').send(VALLEY);
    await request(app).post('/admin/surface-environments').send({ ...VALLEY, key: 'snowfield' });
    syncJson.mockClear();
    const snow = rows.find((r) => r.key === 'snowfield');
    expect((await request(app).delete(`/admin/surface-environments/${snow.id}`)).status).toBe(200);
    expect(rows).toHaveLength(1);
    expect(syncJson).toHaveBeenCalledWith('surface_environments.json', [expect.objectContaining({ key: 'green_valley' })]);
    expect((await request(app).delete('/admin/surface-environments/zzz')).status).toBe(404);
    expect((await request(app).patch('/admin/surface-environments/zzz').send({ name: 'x' })).status).toBe(404);
  });
});

describe('surface picture upload', () => {
  const png = Buffer.from('89504e470d0a1a0a', 'hex');
  const dir = () => path.join(getAssetsRoot(), 'sprites', 'surface');

  beforeEach(() => {
    rows = [{ id: 'e1', key: 'green_valley', name: 'Valley', weight: 1, isDefault: true, sky: { top: '#2f8fd8', horizon: '#9fd6ff' } }];
  });

  it('saves a named picture under the shared assets folder and returns a versioned url', async () => {
    const res = await request(app).post('/admin/surface-environments/e1/images/far_mountains').attach('texture', png, { filename: 'x.png', contentType: 'image/png' });
    expect(res.status).toBe(200);
    expect(res.body.url).toMatch(/^\/assets\/sprites\/surface\/e1-far_mountains\.png\?v=\d+$/);
    expect(fs.existsSync(path.join(dir(), 'e1-far_mountains.png'))).toBe(true);
  });

  it('gives a re-upload a new url so the new picture shows without a refresh', async () => {
    const first = await request(app).post('/admin/surface-environments/e1/images/cloud_a').attach('texture', png, { filename: 'x.png', contentType: 'image/png' });
    await new Promise((r) => setTimeout(r, 5));
    const second = await request(app).post('/admin/surface-environments/e1/images/cloud_a').attach('texture', png, { filename: 'x.png', contentType: 'image/png' });
    expect(second.body.url).not.toBe(first.body.url);
  });

  it('rejects an odd picture name, a non-image, a missing file and an unknown environment', async () => {
    expect((await request(app).post('/admin/surface-environments/e1/images/Bad-Name').attach('texture', png, { filename: 'x.png', contentType: 'image/png' })).status).toBe(400);
    expect((await request(app).post('/admin/surface-environments/e1/images/cloud_a').attach('texture', Buffer.from('hi'), { filename: 'x.txt', contentType: 'text/plain' })).status).toBeGreaterThanOrEqual(400);
    expect((await request(app).post('/admin/surface-environments/e1/images/cloud_a')).status).toBe(400);
    expect((await request(app).post('/admin/surface-environments/nope/images/cloud_a').attach('texture', png, { filename: 'x.png', contentType: 'image/png' })).status).toBe(404);
  });
});
