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
const BIOMES = [{ id: 'b_frozen', key: 'frozen_caves' }, { id: 'b_clay', key: 'clay_pits' }];

/** What Prisma returns for a doodad row: the biome links come with the biome's key. */
const withLinks = (row: any) => ({
  // (the database hands a cleared Json column back as null)
  ...Object.fromEntries(Object.entries(row).map(([k, v]) => [k, v === Prisma.JsonNull ? null : v])),
  biomes: (row.links ?? []).map((l: any) => ({ ...l, biome: { key: BIOMES.find((b) => b.id === l.biomeId)?.key } })),
});

vi.mock('../src/index', () => ({
  prisma: {
    doodad: {
      findMany: vi.fn().mockImplementation(() => Promise.resolve([...rows].sort((a, b) => a.key.localeCompare(b.key)).map(withLinks))),
      findFirst: vi.fn().mockImplementation(({ where }) => {
        const row = rows.find((r) => where.OR.some((c: any) => c.id === r.id || c.key === r.key));
        return Promise.resolve(row ? withLinks(row) : null);
      }),
      findUnique: vi.fn().mockImplementation(({ where }) => Promise.resolve(rows.find((r) => r.key === where.key) ?? null)),
      create: vi.fn().mockImplementation(({ data }) => {
        const { biomes, ...rest } = data;
        const row = { id: `doodad_${rows.length + 1}`, ...rest, links: biomes?.create ?? [] };
        rows.push(row);
        return Promise.resolve(row);
      }),
      update: vi.fn().mockImplementation(({ where, data }) => {
        const i = rows.findIndex((r) => r.id === where.id);
        const { biomes, ...rest } = data;
        rows[i] = { ...rows[i], ...rest, ...(biomes ? { links: [...(biomes.deleteMany ? [] : rows[i].links), ...biomes.create] } : {}) };
        return Promise.resolve(rows[i]);
      }),
      delete: vi.fn().mockImplementation(({ where }) => {
        rows = rows.filter((r) => r.id !== where.id);
        return Promise.resolve({});
      }),
    },
    biome: { findMany: vi.fn().mockImplementation(() => Promise.resolve(BIOMES)) },
    fluid: { findMany: vi.fn().mockResolvedValue([{ typeKey: 'WATER' }]) },
    gas: { findMany: vi.fn().mockResolvedValue([{ typeKey: 'HYDROGEN' }]) },
    particleEffect: { findUnique: vi.fn().mockImplementation(({ where }) => Promise.resolve(where.id === 'fx1' ? { id: 'fx1' } : null)) },
  },
}));

import { adminRouter } from '../src/routes/admin';
import { getAssetsRoot } from '../src/config/assetPaths';

const app = express();
app.use(express.json());
app.use('/admin', adminRouter);

const MUSHROOM = {
  key: 'glow_mushroom', name: 'Glow Mushroom', anchor: 'FLOOR', width: 3, height: 3,
  motion: { preset: 'sway', speed: 0.5 }, reacts: { strength: 0.5, radius: 6 },
  light: { enabled: true, type: 'POINT', effect: 'PULSE', color: '#66ffcc', radius: 6, intensity: 0.8 },
  particleEffectId: 'fx1',
  spawn: { minDepth: 10, blocks: ['STONE'], nearFluids: ['WATER'], nearGases: ['HYDROGEN'], darkOnly: true },
  biomes: [{ biomeId: 'b_frozen', weight: 2, density: 1.5 }],
};

describe('admin doodads', () => {
  beforeEach(() => {
    rows = [];
    syncJson.mockClear();
  });

  it('creates a doodad with its tables and biome links, answers in the shared shape and mirrors to doodads.json', async () => {
    const res = await request(app).post('/admin/doodads').send(MUSHROOM);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ key: 'glow_mushroom', anchor: 'FLOOR', width: 3, motion: { preset: 'sway', speed: 0.5 }, particleEffectId: 'fx1' });
    expect(res.body.biomes).toEqual([{ biomeId: 'b_frozen', biomeKey: 'frozen_caves', weight: 2, density: 1.5 }]);
    expect(syncJson).toHaveBeenCalledWith('doodads.json', [expect.objectContaining({ key: 'glow_mushroom', biomes: [expect.objectContaining({ biomeKey: 'frozen_caves' })] })]);
    expect(rows[0]).toMatchObject({ sizeVariants: Prisma.JsonNull, parts: Prisma.JsonNull, wander: Prisma.JsonNull });
  });

  it('fills in a footprint, anchor and draw order when they are not sent', async () => {
    const res = await request(app).post('/admin/doodads').send({ key: 'moss', name: 'Moss' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ anchor: 'FLOOR', width: 3, height: 3, zOffset: 0, biomes: [] });
  });

  it('accepts numbers sent as strings (form fields)', async () => {
    const res = await request(app).post('/admin/doodads').send({ key: 'moss', name: 'Moss', width: '6', height: '2', zOffset: '1' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ width: 6, height: 2, zOffset: 1 });
  });

  it('lists doodads by key and fetches one by id or key', async () => {
    await request(app).post('/admin/doodads').send({ key: 'zz', name: 'Z' });
    await request(app).post('/admin/doodads').send({ key: 'aa', name: 'A' });
    expect((await request(app).get('/admin/doodads')).body.map((d: any) => d.key)).toEqual(['aa', 'zz']);
    expect((await request(app).get('/admin/doodads/aa')).body.name).toBe('A');
    expect((await request(app).get('/admin/doodads/AA')).body.key).toBe('aa');
    expect((await request(app).get(`/admin/doodads/${rows[0].id}`)).body.key).toBe('zz');
    expect((await request(app).get('/admin/doodads/nope')).status).toBe(404);
  });

  it('rejects an invalid doodad with every problem listed and saves nothing', async () => {
    const res = await request(app).post('/admin/doodads').send({ key: 'Bad Key', name: '', anchor: 'SIDEWAYS', width: 0, height: 0 });
    expect(res.status).toBe(400);
    expect(res.body.errors.length).toBe(5);
    expect(rows).toHaveLength(0);
    expect(syncJson).not.toHaveBeenCalled();
  });

  it('rejects a footprint with no cells in it', async () => {
    const res = await request(app).post('/admin/doodads').send({ ...MUSHROOM, width: 0 });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('width must be a whole number of at least 1');
  });

  it('rejects names of blocks, fluids, gases, effects and biomes that do not exist', async () => {
    const res = await request(app).post('/admin/doodads').send({
      ...MUSHROOM,
      particleEffectId: 'fx_ghost',
      reacts: { strength: 1, radius: 3, puffEffectId: 'fx_other' },
      spawn: { blocks: ['GHOST'], nearFluids: ['WATERISH'], nearGases: ['ARGON'] },
      biomes: [{ biomeId: 'b_ghost' }],
    });
    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual(expect.arrayContaining([
      expect.stringContaining('unknown block: GHOST'),
      expect.stringContaining('unknown fluid: WATERISH'),
      expect.stringContaining('unknown gas: ARGON'),
      expect.stringContaining('unknown particle effect: fx_ghost'),
      expect.stringContaining('unknown particle effect: fx_other'),
      expect.stringContaining('unknown biome: b_ghost'),
    ]));
    expect(rows).toHaveLength(0);
  });

  it('takes a biome by key as well as by id', async () => {
    const res = await request(app).post('/admin/doodads').send({ key: 'moss', name: 'Moss', biomes: [{ biomeKey: 'clay_pits', weight: 3 }] });
    expect(res.status).toBe(201);
    expect(res.body.biomes).toEqual([{ biomeId: 'b_clay', biomeKey: 'clay_pits', weight: 3, density: 1 }]);
  });

  it('rejects a biome listed twice and a negative weight', async () => {
    const res = await request(app).post('/admin/doodads').send({ ...MUSHROOM, biomes: [{ biomeId: 'b_frozen', weight: -1 }, { biomeId: 'b_frozen' }] });
    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual(expect.arrayContaining([expect.stringContaining('weight'), expect.stringContaining('twice')]));
  });

  it('saves health, fall damage and a death effect, and clears them with null or an empty value (ticket 143)', async () => {
    const created = await request(app).post('/admin/doodads').send({ key: 'beetle', name: 'Beetle', health: '10', fallDamage: 4, deathParticleEffectId: 'fx1' });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ health: 10, fallDamage: 4, deathParticleEffectId: 'fx1' });
    const id = rows[0].id;
    const cleared = await request(app).patch(`/admin/doodads/${id}`).send({ health: '', fallDamage: null, deathParticleEffectId: null });
    expect(cleared.status).toBe(200);
    expect(rows[0]).toMatchObject({ health: null, fallDamage: null, deathParticleEffectId: null });
  });

  it('rejects bad health and an unknown death effect', async () => {
    const res = await request(app).post('/admin/doodads').send({ key: 'beetle', name: 'Beetle', health: 0, deathParticleEffectId: 'fx_ghost' });
    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual(expect.arrayContaining([expect.stringContaining('health'), expect.stringContaining('unknown particle effect: fx_ghost')]));
    expect(rows).toHaveLength(0);
  });

  it('rejects a duplicate key', async () => {
    await request(app).post('/admin/doodads').send(MUSHROOM);
    expect((await request(app).post('/admin/doodads').send(MUSHROOM)).status).toBe(409);
  });

  it('updates a doodad (PUT and PATCH), clearing a table with null and keeping what was not mentioned', async () => {
    await request(app).post('/admin/doodads').send(MUSHROOM);
    const id = rows[0].id;
    const res = await request(app).patch(`/admin/doodads/${id}`).send({ width: 6, motion: null });
    expect(res.status).toBe(200);
    expect(rows[0]).toMatchObject({ width: 6, motion: Prisma.JsonNull });
    expect(rows[0].reacts).toEqual(MUSHROOM.reacts);
    expect(res.body.biomes).toHaveLength(1);
    expect((await request(app).put(`/admin/doodads/${id}`).send({ name: 'Mushroom' })).status).toBe(200);
    expect(rows[0].name).toBe('Mushroom');
  });

  it('replaces the biome list when one is sent, and leaves it alone when not', async () => {
    await request(app).post('/admin/doodads').send(MUSHROOM);
    const id = rows[0].id;
    await request(app).patch(`/admin/doodads/${id}`).send({ name: 'Renamed' });
    expect(rows[0].links).toEqual([{ biomeId: 'b_frozen', weight: 2, density: 1.5 }]);
    const res = await request(app).patch(`/admin/doodads/${id}`).send({ biomes: [{ biomeId: 'b_clay', weight: 4 }] });
    expect(res.body.biomes).toEqual([{ biomeId: 'b_clay', biomeKey: 'clay_pits', weight: 4, density: 1 }]);
    const cleared = await request(app).patch(`/admin/doodads/${id}`).send({ biomes: [] });
    expect(cleared.body.biomes).toEqual([]);
  });

  it('refuses an update that would leave the doodad invalid, and changes nothing', async () => {
    await request(app).post('/admin/doodads').send(MUSHROOM);
    const id = rows[0].id;
    syncJson.mockClear();
    const res = await request(app).patch(`/admin/doodads/${id}`).send({ height: 0 });
    expect(res.status).toBe(400);
    expect(rows[0].height).toBe(3);
    expect(syncJson).not.toHaveBeenCalled();
  });

  it('refuses to change a key, and allows sending the same key back', async () => {
    await request(app).post('/admin/doodads').send(MUSHROOM);
    const id = rows[0].id;
    expect((await request(app).put(`/admin/doodads/${id}`).send({ key: 'other' })).status).toBe(400);
    expect((await request(app).put(`/admin/doodads/${id}`).send(MUSHROOM)).status).toBe(200);
  });

  it('404s when updating or deleting a doodad that does not exist', async () => {
    expect((await request(app).put('/admin/doodads/zzz').send({ name: 'x' })).status).toBe(404);
    expect((await request(app).delete('/admin/doodads/zzz')).status).toBe(404);
  });

  it('deletes a doodad and mirrors the change', async () => {
    await request(app).post('/admin/doodads').send(MUSHROOM);
    syncJson.mockClear();
    expect((await request(app).delete(`/admin/doodads/${rows[0].id}`)).status).toBe(200);
    expect(rows).toHaveLength(0);
    expect(syncJson).toHaveBeenCalledWith('doodads.json', []);
  });
});

describe('doodad texture upload', () => {
  const png = Buffer.from('89504e470d0a1a0a', 'hex');
  const dir = () => path.join(getAssetsRoot(), 'sprites', 'doodads');

  beforeEach(() => {
    rows = [{ id: 'd1', key: 'glow_mushroom', name: 'Glow', anchor: 'FLOOR', width: 3, height: 3, zOffset: 0, links: [] }];
    syncJson.mockClear();
  });

  it('saves the main picture under the shared assets folder and points the doodad at it', async () => {
    const res = await request(app).post('/admin/doodads/d1/texture').attach('texture', png, { filename: 'x.png', contentType: 'image/png' });
    expect(res.status).toBe(200);
    expect(res.body.textureUrl).toMatch(/^\/assets\/sprites\/doodads\/d1\.png\?v=\d+$/);
    expect(fs.existsSync(path.join(dir(), 'd1.png'))).toBe(true);
    expect(rows[0].textureUrl).toBe(res.body.textureUrl);
    expect(syncJson).toHaveBeenCalled();
  });

  it('gives a re-upload a new url so the new picture shows without a refresh', async () => {
    const first = await request(app).post('/admin/doodads/d1/texture').attach('texture', png, { filename: 'x.png', contentType: 'image/png' });
    await new Promise((r) => setTimeout(r, 5));
    const second = await request(app).post('/admin/doodads/d1/texture').attach('texture', png, { filename: 'x.png', contentType: 'image/png' });
    expect(second.body.textureUrl).not.toBe(first.body.textureUrl);
  });

  it('saves a named picture for a part or a size and only returns its url', async () => {
    const res = await request(app).post('/admin/doodads/d1/images/cap').attach('texture', png, { filename: 'x.png', contentType: 'image/png' });
    expect(res.status).toBe(200);
    expect(res.body.url).toMatch(/^\/assets\/sprites\/doodads\/d1-cap\.png\?v=\d+$/);
    expect(fs.existsSync(path.join(dir(), 'd1-cap.png'))).toBe(true);
    expect(rows[0].textureUrl).toBeUndefined();
  });

  it('rejects a missing file, a missing doodad, a bad picture name and a non-image', async () => {
    expect((await request(app).post('/admin/doodads/d1/texture').send({})).status).toBe(400);
    expect((await request(app).post('/admin/doodads/ghost/texture').attach('texture', png, { filename: 'x.png', contentType: 'image/png' })).status).toBe(404);
    expect((await request(app).post('/admin/doodads/d1/images/Bad%20Name').attach('texture', png, { filename: 'x.png', contentType: 'image/png' })).status).toBe(400);
    const text = await request(app).post('/admin/doodads/d1/texture').attach('texture', Buffer.from('hi'), { filename: 'x.txt', contentType: 'text/plain' });
    expect(text.status).toBeGreaterThanOrEqual(400);
  });
});
