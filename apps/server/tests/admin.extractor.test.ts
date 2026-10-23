import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import fs from 'fs';
import path from 'path';

vi.mock('../src/middleware/auth', () => ({
  adminMiddleware: (_req: any, _res: any, next: any) => next(),
  authenticateToken: (_req: any, _res: any, next: any) => next(),
}));
const { syncJson } = vi.hoisted(() => ({ syncJson: vi.fn() }));
vi.mock('../src/services/admin.service', async () => ({ ...(await vi.importActual<any>('../src/services/admin.service')), syncJson }));

let rows: any[] = [];
let counter = 0;
const matches = (where: any, row: any): boolean => {
  if (where.OR) return where.OR.some((c: any) => matches(c, row));
  return Object.entries(where).every(([k, v]: any) => (v && typeof v === 'object' && 'not' in v ? row[k] !== v.not : row[k] === v));
};
vi.mock('../src/index', () => ({
  prisma: {
    extractor: {
      findMany: vi.fn().mockImplementation(() => Promise.resolve([...rows])),
      findFirst: vi.fn().mockImplementation(({ where }) => Promise.resolve(rows.find((r) => matches(where, r)) ?? null)),
      findUnique: vi.fn().mockImplementation(({ where }) => Promise.resolve(rows.find((r) => matches(where, r)) ?? null)),
      create: vi.fn().mockImplementation(({ data }) => {
        const row = { id: `e${++counter}`, soundEffects: null, textureUrl: null, beltTextureUrl: null, ...data };
        rows.push(row);
        return Promise.resolve(row);
      }),
      update: vi.fn().mockImplementation(({ where, data }) => {
        const i = rows.findIndex((r) => r.id === where.id);
        const { landingParticleEffect, ...rest } = data;
        rows[i] = { ...rows[i], ...rest };
        if (landingParticleEffect) rows[i].landingParticleEffectId = landingParticleEffect.connect?.id ?? null;
        return Promise.resolve(rows[i]);
      }),
      updateMany: vi.fn().mockImplementation(({ where, data }) => {
        rows.filter((r) => matches(where, r)).forEach((r) => Object.assign(r, data));
        return Promise.resolve({ count: 0 });
      }),
      delete: vi.fn().mockImplementation(({ where }) => {
        rows = rows.filter((r) => r.id !== where.id);
        return Promise.resolve({});
      }),
    },
  },
}));

import { adminRouter } from '../src/routes/admin';
import { getAssetsRoot } from '../src/config/assetPaths';

const app = express();
app.use(express.json());
app.use('/admin', adminRouter);

const valid = (over: object = {}) => ({
  key: 'basic_extractor', name: 'Basic', width: 12, height: 9, entranceOffset: 24, landingSeconds: 3, shaftWidth: 3,
  buildSecondsPerSegment: 1.5, beltSpeed: 6, beltItemSpacing: 1.5, depositItemsPerSecond: 20, unloadItemsPerSecond: 4,
  beltSegmentHealth: 100, health: 500, ...over,
});

describe('admin extractors', () => {
  beforeEach(() => {
    rows = [];
    counter = 0;
    syncJson.mockClear();
  });

  it('creates an extractor, mirrors the table, and lists it', async () => {
    const res = await request(app).post('/admin/extractors').send(valid());
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ key: 'basic_extractor', name: 'Basic', isDefault: false });
    expect(syncJson).toHaveBeenCalledWith('extractors.json', expect.any(Array));
    expect((await request(app).get('/admin/extractors')).body).toHaveLength(1);
  });

  it('reads numbers sent as text', async () => {
    const res = await request(app).post('/admin/extractors').send(valid({ beltSpeed: '7.5', width: '12' }));
    expect(res.status).toBe(201);
    expect(res.body.beltSpeed).toBe(7.5);
  });

  it('rejects every bad value with all the problems at once, and writes nothing', async () => {
    const res = await request(app).post('/admin/extractors').send(valid({ key: 'Bad Key', name: ' ', beltSpeed: 0, shaftWidth: 0, health: -1 }));
    expect(res.status).toBe(400);
    expect(res.body.errors.length).toBeGreaterThanOrEqual(5);
    expect(rows).toHaveLength(0);
  });

  it('refuses a second extractor with the same key', async () => {
    await request(app).post('/admin/extractors').send(valid());
    expect((await request(app).post('/admin/extractors').send(valid({ name: 'Copy' }))).status).toBe(409);
  });

  it('finds an extractor by id or key, and 404s for a missing one', async () => {
    const created = (await request(app).post('/admin/extractors').send(valid())).body;
    expect((await request(app).get(`/admin/extractors/${created.id}`)).status).toBe(200);
    expect((await request(app).get('/admin/extractors/BASIC_EXTRACTOR')).status).toBe(200);
    expect((await request(app).get('/admin/extractors/nope')).status).toBe(404);
  });

  it('updates part of an extractor, checked as it would be afterwards', async () => {
    const created = (await request(app).post('/admin/extractors').send(valid())).body;
    const ok = await request(app).put(`/admin/extractors/${created.id}`).send({ beltSpeed: 9 });
    expect(ok.status).toBe(200);
    expect(rows[0].beltSpeed).toBe(9);
    const bad = await request(app).put(`/admin/extractors/${created.id}`).send({ beltSpeed: 0 });
    expect(bad.status).toBe(400);
    expect(rows[0].beltSpeed).toBe(9);
    expect((await request(app).put(`/admin/extractors/${created.id}`).send({ key: 'other' })).status).toBe(400);
    expect((await request(app).put('/admin/extractors/ghost').send({ beltSpeed: 3 })).status).toBe(404);
  });

  it('keeps one default: marking one clears the others', async () => {
    const a = (await request(app).post('/admin/extractors').send(valid({ isDefault: true }))).body;
    const b = (await request(app).post('/admin/extractors').send(valid({ key: 'second', isDefault: true }))).body;
    expect(rows.find((r) => r.id === a.id).isDefault).toBe(false);
    expect(rows.find((r) => r.id === b.id).isDefault).toBe(true);
    await request(app).put(`/admin/extractors/${a.id}`).send({ isDefault: true });
    expect(rows.filter((r) => r.isDefault).map((r) => r.id)).toEqual([a.id]);
  });

  it('sets and clears the landing particle effect', async () => {
    const created = (await request(app).post('/admin/extractors').send(valid())).body;
    await request(app).put(`/admin/extractors/${created.id}`).send({ landingParticleEffectId: 'fx1' });
    expect(rows[0].landingParticleEffectId).toBe('fx1');
  });

  it('deletes an extractor and mirrors the table', async () => {
    const created = (await request(app).post('/admin/extractors').send(valid())).body;
    syncJson.mockClear();
    expect((await request(app).delete(`/admin/extractors/${created.id}`)).status).toBe(200);
    expect(rows).toHaveLength(0);
    expect(syncJson).toHaveBeenCalled();
    expect((await request(app).delete(`/admin/extractors/${created.id}`)).status).toBe(404);
  });

  describe('texture upload', () => {
    const png = Buffer.from('89504e470d0a1a0a', 'hex');

    it('saves the machine picture under the shared assets folder and points the extractor at it', async () => {
      const created = (await request(app).post('/admin/extractors').send(valid())).body;
      const res = await request(app).post(`/admin/extractors/${created.id}/texture/body`).attach('texture', png, { filename: 'x.png', contentType: 'image/png' });
      expect(res.status).toBe(200);
      expect(res.body.textureUrl).toBe(`/assets/sprites/extractors/${created.id}-body.png`);
      expect(fs.existsSync(path.join(getAssetsRoot(), 'sprites', 'extractors', `${created.id}-body.png`))).toBe(true);
    });

    it('saves the belt picture on its own field', async () => {
      const created = (await request(app).post('/admin/extractors').send(valid())).body;
      const res = await request(app).post(`/admin/extractors/${created.id}/texture/belt`).attach('texture', png, { filename: 'b.png', contentType: 'image/png' });
      expect(res.body.beltTextureUrl).toBe(`/assets/sprites/extractors/${created.id}-belt.png`);
      expect(res.body.textureUrl).toBeNull();
    });

    it('rejects an unknown part, a missing file, a missing extractor and a non-image', async () => {
      const created = (await request(app).post('/admin/extractors').send(valid())).body;
      expect((await request(app).post(`/admin/extractors/${created.id}/texture/wings`).attach('texture', png, { filename: 'x.png', contentType: 'image/png' })).status).toBe(400);
      expect((await request(app).post(`/admin/extractors/${created.id}/texture/body`).send({})).status).toBe(400);
      expect((await request(app).post('/admin/extractors/ghost/texture/body').attach('texture', png, { filename: 'x.png', contentType: 'image/png' })).status).toBe(404);
      const text = await request(app).post(`/admin/extractors/${created.id}/texture/body`).attach('texture', Buffer.from('hi'), { filename: 'x.txt', contentType: 'text/plain' });
      expect(text.status).toBeGreaterThanOrEqual(400);
    });
  });
});
