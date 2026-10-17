import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
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

let rows: any[] = [];
let blocks: string[] = ['LAVAROCK'];

vi.mock('../src/index', () => ({
  prisma: {
    miningBlock: { findUnique: vi.fn().mockImplementation(({ where }) => Promise.resolve(blocks.includes(where.typeKey) ? { typeKey: where.typeKey } : null)) },
    fluid: {
      findMany: vi.fn().mockImplementation(() => Promise.resolve([...rows].sort((a, b) => a.typeKey.localeCompare(b.typeKey)))),
      findFirst: vi.fn().mockImplementation(({ where }) =>
        Promise.resolve(rows.find((r) => where.OR.some((c: any) => c.id === r.id || c.typeKey === r.typeKey)) ?? null)
      ),
      findUnique: vi.fn().mockImplementation(({ where }) => Promise.resolve(rows.find((r) => r.typeKey === where.typeKey) ?? null)),
      create: vi.fn().mockImplementation(({ data }) => {
        const row = { id: `fluid_${rows.length + 1}`, ...data };
        rows.push(row);
        return Promise.resolve(row);
      }),
      update: vi.fn().mockImplementation(({ where, data }) => {
        const i = rows.findIndex((r) => r.id === where.id);
        rows[i] = { ...rows[i], ...data };
        return Promise.resolve(rows[i]);
      }),
      delete: vi.fn().mockImplementation(({ where }) => {
        rows = rows.filter((r) => r.id !== where.id);
        return Promise.resolve({});
      }),
    },
  },
}));

import { adminRouter } from '../src/routes/admin';

const app = express();
app.use(express.json());
app.use('/admin', adminRouter);

const OIL = {
  id: 'fluid_oil', typeKey: 'OIL', name: 'Oil', description: 'Black', color: '#0b0b0d', opacity: 0.9, density: 0.8,
  viscosity: 0.6, flowRate: 0.35, minLevel: 0.05, flowThreshold: 0.02,
  flammability: { ignitionChance: 0.8, spreadChance: 0.5, burnDuration: 8, heat: 3, burnsInto: null },
  generation: { minDepth: 8, maxDepth: null, percentage: 1.5, minSize: 2, maxSize: 4 },
};
const NEW_WATER = { typeKey: 'WATER', name: 'Water', color: '#3b82f6', opacity: 0.6, density: 1, viscosity: 0.2, flowRate: 0.6, minLevel: 0.01, flowThreshold: 0.01 };

describe('admin fluids', () => {
  beforeEach(() => {
    rows = [{ ...OIL }];
    syncJson.mockClear();
  });

  it('lists fluids by key and fetches one by id or key', async () => {
    rows.push({ ...OIL, id: 'fluid_a', typeKey: 'ACID' });
    const list = await request(app).get('/admin/fluids');
    expect(list.body.map((f: any) => f.typeKey)).toEqual(['ACID', 'OIL']);
    expect((await request(app).get('/admin/fluids/fluid_oil')).body.typeKey).toBe('OIL');
    expect((await request(app).get('/admin/fluids/oil')).body.id).toBe('fluid_oil');
    expect((await request(app).get('/admin/fluids/nope')).status).toBe(404);
  });

  it('creates a fluid, with no flammability or generation unless given, and mirrors to fluids.json', async () => {
    const res = await request(app).post('/admin/fluids').send(NEW_WATER);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ typeKey: 'WATER', name: 'Water' });
    expect(rows).toHaveLength(2);
    expect(syncJson).toHaveBeenCalledWith('fluids.json', expect.any(Array));
  });

  it('accepts numbers sent as strings (form fields)', async () => {
    const res = await request(app).post('/admin/fluids').send({ ...NEW_WATER, opacity: '0.5', flowRate: '0.4' });
    expect(res.status).toBe(201);
    expect(res.body.opacity).toBe(0.5);
  });

  it('rejects an invalid fluid with every problem listed', async () => {
    const res = await request(app).post('/admin/fluids').send({ ...NEW_WATER, typeKey: 'water', color: 'blue', flowRate: 0 });
    expect(res.status).toBe(400);
    expect(res.body.errors.length).toBe(3);
    expect(res.body.error).toContain('typeKey');
    expect(rows).toHaveLength(1);
    expect(syncJson).not.toHaveBeenCalled();
  });

  it('rejects a duplicate key', async () => {
    const res = await request(app).post('/admin/fluids').send({ ...NEW_WATER, typeKey: 'OIL' });
    expect(res.status).toBe(409);
    expect(rows).toHaveLength(1);
  });

  it('updates a fluid, including turning flammability and generation off', async () => {
    const res = await request(app).put('/admin/fluids/fluid_oil').send({ viscosity: 0.9, flammability: null, generation: null });
    expect(res.status).toBe(200);
    expect(rows[0].viscosity).toBe(0.9);
    // A Json column is cleared with JsonNull, never a bare null
    expect(rows[0].flammability).toBe(Prisma.JsonNull);
    expect(rows[0].generation).toBe(Prisma.JsonNull);
    expect(syncJson).toHaveBeenCalled();
  });

  it('saves how the fluid looks, and clears it back to the defaults with null', async () => {
    const res = await request(app).put('/admin/fluids/fluid_oil').send({ appearance: { waveAmplitude: 0.02, waveSpeed: 0.3 } });
    expect(res.status).toBe(200);
    expect(rows[0].appearance).toEqual({ waveAmplitude: 0.02, waveSpeed: 0.3 });
    await request(app).put('/admin/fluids/fluid_oil').send({ appearance: null });
    expect(rows[0].appearance).toBe(Prisma.JsonNull);
  });

  it('saves contact effects and a glow, and clears them with null', async () => {
    const light = { enabled: true, type: 'POINT', color: '#ff7a1c', radius: 4, intensity: 0.8 };
    const res = await request(app).put('/admin/fluids/fluid_oil').send({ contact: { damagePerSecond: 20, ignites: 100 }, light });
    expect(res.status).toBe(200);
    expect(rows[0].contact).toEqual({ damagePerSecond: 20, ignites: 100 });
    expect(rows[0].light).toEqual(light);
    await request(app).put('/admin/fluids/fluid_oil').send({ contact: null, light: null });
    expect(rows[0].contact).toBe(Prisma.JsonNull);
    expect(rows[0].light).toBe(Prisma.JsonNull);
  });

  it('refuses bad contact effects and a bad glow', async () => {
    const res = await request(app).put('/admin/fluids/fluid_oil').send({ contact: { damagePerSecond: -5 }, light: { radius: 0 } });
    expect(res.status).toBe(400);
    expect(res.body.errors).toContain('contact.damagePerSecond must be 0 or more');
    expect(res.body.errors).toContain('light needs a radius and intensity above 0');
  });

  it('saves reactions that name an existing fluid and block, and refuses ones that do not', async () => {
    rows.push({ ...OIL, id: 'fluid_water', typeKey: 'WATER', name: 'Water' });
    const good = [{ with: 'WATER', becomes: 'LAVAROCK', costPerLevel: 2 }];
    expect((await request(app).put('/admin/fluids/fluid_oil').send({ reactions: good })).status).toBe(200);
    expect(rows[0].reactions).toEqual(good);
    const noFluid = await request(app).put('/admin/fluids/fluid_oil').send({ reactions: [{ with: 'ACID', becomes: 'LAVAROCK', costPerLevel: 1 }] });
    expect(noFluid.status).toBe(400);
    expect(noFluid.body.errors).toContain('reactions[0].with: there is no fluid ACID');
    const noBlock = await request(app).put('/admin/fluids/fluid_oil').send({ reactions: [{ with: 'WATER', becomes: 'NOPE', costPerLevel: 1 }] });
    expect(noBlock.body.errors).toContain('reactions[0].becomes: there is no block NOPE');
    expect(rows[0].reactions).toEqual(good);
  });

  it('refuses to delete a fluid that another fluid reacts with', async () => {
    rows.push({ ...OIL, id: 'fluid_water', typeKey: 'WATER', name: 'Water' });
    rows[0].reactions = [{ with: 'WATER', becomes: 'LAVAROCK', costPerLevel: 2 }];
    const res = await request(app).delete('/admin/fluids/fluid_water');
    expect(res.status).toBe(409);
    expect(rows).toHaveLength(2);
    expect((await request(app).delete('/admin/fluids/fluid_oil')).status).toBe(200);
  });

  it('refuses a look setting out of range', async () => {
    const res = await request(app).put('/admin/fluids/fluid_oil').send({ appearance: { waveAmplitude: 5 } });
    expect(res.status).toBe(400);
    expect(res.body.errors.some((e: string) => e.includes('appearance.waveAmplitude'))).toBe(true);
    expect(rows[0].appearance).toBeUndefined();
  });

  it('creates a fluid with a look', async () => {
    const res = await request(app).post('/admin/fluids').send({ ...NEW_WATER, appearance: { highlight: 0.8 } });
    expect(res.status).toBe(201);
    expect(rows.find((r) => r.typeKey === 'WATER')!.appearance).toEqual({ highlight: 0.8 });
  });

  it('keeps what a partial update does not mention', async () => {
    await request(app).put('/admin/fluids/fluid_oil').send({ name: 'Crude Oil' });
    expect(rows[0]).toMatchObject({ name: 'Crude Oil', color: '#0b0b0d', density: 0.8 });
    expect(rows[0].flammability).toEqual(OIL.flammability);
  });

  it('refuses an update that would leave the fluid invalid, and changes nothing', async () => {
    const res = await request(app).put('/admin/fluids/fluid_oil').send({ opacity: 3, flammability: { ignitionChance: 2 } });
    expect(res.status).toBe(400);
    expect(res.body.errors.some((e: string) => e.includes('opacity'))).toBe(true);
    expect(res.body.errors.some((e: string) => e.includes('ignitionChance'))).toBe(true);
    expect(rows[0].opacity).toBe(0.9);
    expect(syncJson).not.toHaveBeenCalled();
  });

  it('refuses to change a fluid\'s key', async () => {
    const res = await request(app).put('/admin/fluids/fluid_oil').send({ typeKey: 'CRUDE' });
    expect(res.status).toBe(400);
    expect(rows[0].typeKey).toBe('OIL');
  });

  it('allows sending the same key back, as a whole-form save does', async () => {
    const res = await request(app).put('/admin/fluids/fluid_oil').send({ ...OIL, name: 'Oil 2' });
    expect(res.status).toBe(200);
    expect(rows[0].name).toBe('Oil 2');
  });

  it('404s when updating or deleting a fluid that does not exist', async () => {
    expect((await request(app).put('/admin/fluids/zzz').send({ name: 'x' })).status).toBe(404);
    expect((await request(app).delete('/admin/fluids/zzz')).status).toBe(404);
  });

  it('deletes a fluid and mirrors the change', async () => {
    const res = await request(app).delete('/admin/fluids/fluid_oil');
    expect(res.status).toBe(200);
    expect(rows).toHaveLength(0);
    expect(syncJson).toHaveBeenCalledWith('fluids.json', []);
  });
});
