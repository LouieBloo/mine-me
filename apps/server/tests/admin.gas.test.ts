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

vi.mock('../src/index', () => ({
  prisma: {
    gas: {
      findMany: vi.fn().mockImplementation(() => Promise.resolve([...rows].sort((a, b) => a.typeKey.localeCompare(b.typeKey)))),
      findFirst: vi.fn().mockImplementation(({ where }) =>
        Promise.resolve(rows.find((r) => where.OR.some((c: any) => c.id === r.id || c.typeKey === r.typeKey)) ?? null)
      ),
      findUnique: vi.fn().mockImplementation(({ where }) => Promise.resolve(rows.find((r) => r.typeKey === where.typeKey) ?? null)),
      create: vi.fn().mockImplementation(({ data }) => {
        const row = { id: `gas_${rows.length + 1}`, ...data };
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

const HYDROGEN = {
  id: 'gas_h2', typeKey: 'HYDROGEN', name: 'Hydrogen', description: 'Light', color: '#dff1ff', opacity: 0.35, density: 0.07,
  diffusionRate: 0.35, minConcentration: 0.02, ventLifetime: 6,
  flammability: { ignitionChance: 0.9, spreadChance: 1, burnDuration: 0.5, heat: 4, burnsInto: null },
  generation: { minDepth: 3, maxDepth: null, percentage: 3, minSize: 2, maxSize: 4, concentration: 1 },
};
const NEW_NITROGEN = { typeKey: 'NITROGEN', name: 'Nitrogen', color: '#9db7cc', opacity: 0.3, density: 1.15, diffusionRate: 0.25, minConcentration: 0.02, ventLifetime: 6 };

describe('admin gases', () => {
  beforeEach(() => {
    rows = [{ ...HYDROGEN }];
    syncJson.mockClear();
  });

  it('lists gases by key and fetches one by id or key', async () => {
    rows.push({ ...HYDROGEN, id: 'gas_a', typeKey: 'ARGON' });
    const list = await request(app).get('/admin/gases');
    expect(list.body.map((f: any) => f.typeKey)).toEqual(['ARGON', 'HYDROGEN']);
    expect((await request(app).get('/admin/gases/gas_h2')).body.typeKey).toBe('HYDROGEN');
    expect((await request(app).get('/admin/gases/hydrogen')).body.id).toBe('gas_h2');
    expect((await request(app).get('/admin/gases/nope')).status).toBe(404);
  });

  it('creates a gas, with no flammability or generation unless given, and mirrors to gases.json', async () => {
    const res = await request(app).post('/admin/gases').send(NEW_NITROGEN);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ typeKey: 'NITROGEN', name: 'Nitrogen' });
    expect(rows).toHaveLength(2);
    expect(syncJson).toHaveBeenCalledWith('gases.json', expect.any(Array));
  });

  it('accepts numbers sent as strings (form fields)', async () => {
    const res = await request(app).post('/admin/gases').send({ ...NEW_NITROGEN, opacity: '0.5', diffusionRate: '0.4' });
    expect(res.status).toBe(201);
    expect(res.body.opacity).toBe(0.5);
  });

  it('rejects an invalid gas with every problem listed', async () => {
    const res = await request(app).post('/admin/gases').send({ ...NEW_NITROGEN, typeKey: 'nitrogen', color: 'blue', diffusionRate: 0 });
    expect(res.status).toBe(400);
    expect(res.body.errors.length).toBe(3);
    expect(res.body.error).toContain('typeKey');
    expect(rows).toHaveLength(1);
    expect(syncJson).not.toHaveBeenCalled();
  });

  it('rejects a duplicate key', async () => {
    const res = await request(app).post('/admin/gases').send({ ...NEW_NITROGEN, typeKey: 'HYDROGEN' });
    expect(res.status).toBe(409);
    expect(rows).toHaveLength(1);
  });

  it('updates a gas, including turning flammability and generation off', async () => {
    const res = await request(app).put('/admin/gases/gas_h2').send({ ventLifetime: 12, flammability: null, generation: null });
    expect(res.status).toBe(200);
    expect(rows[0].ventLifetime).toBe(12);
    // A Json column is cleared with JsonNull, never a bare null
    expect(rows[0].flammability).toBe(Prisma.JsonNull);
    expect(rows[0].generation).toBe(Prisma.JsonNull);
    expect(syncJson).toHaveBeenCalled();
  });

  it('saves how the gas looks, and clears it back to the defaults with null', async () => {
    const res = await request(app).put('/admin/gases/gas_h2').send({ appearance: { softness: 0.2, driftSpeed: 0.3 } });
    expect(res.status).toBe(200);
    expect(rows[0].appearance).toEqual({ softness: 0.2, driftSpeed: 0.3 });
    await request(app).put('/admin/gases/gas_h2').send({ appearance: null });
    expect(rows[0].appearance).toBe(Prisma.JsonNull);
  });

  it('refuses a look setting out of range', async () => {
    const res = await request(app).put('/admin/gases/gas_h2').send({ appearance: { softness: 5 } });
    expect(res.status).toBe(400);
    expect(res.body.errors.some((e: string) => e.includes('appearance.softness'))).toBe(true);
    expect(rows[0].appearance).toBeUndefined();
  });

  it('creates a gas with a look', async () => {
    const res = await request(app).post('/admin/gases').send({ ...NEW_NITROGEN, appearance: { softness: 0.8 } });
    expect(res.status).toBe(201);
    expect(rows.find((r) => r.typeKey === 'NITROGEN')!.appearance).toEqual({ softness: 0.8 });
  });

  it('keeps what a partial update does not mention', async () => {
    await request(app).put('/admin/gases/gas_h2').send({ name: 'Hydrogen Gas' });
    expect(rows[0]).toMatchObject({ name: 'Hydrogen Gas', color: '#dff1ff', density: 0.07 });
    expect(rows[0].flammability).toEqual(HYDROGEN.flammability);
  });

  it('refuses an update that would leave the gas invalid, and changes nothing', async () => {
    const res = await request(app).put('/admin/gases/gas_h2').send({ opacity: 3, flammability: { ignitionChance: 2 } });
    expect(res.status).toBe(400);
    expect(res.body.errors.some((e: string) => e.includes('opacity'))).toBe(true);
    expect(res.body.errors.some((e: string) => e.includes('ignitionChance'))).toBe(true);
    expect(rows[0].opacity).toBe(0.35);
    expect(syncJson).not.toHaveBeenCalled();
  });

  it('refuses to change a gas\'s key', async () => {
    const res = await request(app).put('/admin/gases/gas_h2').send({ typeKey: 'H2' });
    expect(res.status).toBe(400);
    expect(rows[0].typeKey).toBe('HYDROGEN');
  });

  it('allows sending the same key back, as a whole-form save does', async () => {
    const res = await request(app).put('/admin/gases/gas_h2').send({ ...HYDROGEN, name: 'H2' });
    expect(res.status).toBe(200);
    expect(rows[0].name).toBe('H2');
  });

  it('404s when updating or deleting a gas that does not exist', async () => {
    expect((await request(app).put('/admin/gases/zzz').send({ name: 'x' })).status).toBe(404);
    expect((await request(app).delete('/admin/gases/zzz')).status).toBe(404);
  });

  it('refuses a generation with a concentration above 1', async () => {
    const res = await request(app).put('/admin/gases/gas_h2').send({ generation: { ...HYDROGEN.generation, concentration: 2 } });
    expect(res.status).toBe(400);
    expect(res.body.errors.some((e: string) => e.includes('concentration'))).toBe(true);
  });

  it('refuses a vent lifetime of zero', async () => {
    const res = await request(app).post('/admin/gases').send({ ...NEW_NITROGEN, ventLifetime: 0 });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('ventLifetime');
  });

  it('deletes a gas and mirrors the change', async () => {
    const res = await request(app).delete('/admin/gases/gas_h2');
    expect(res.status).toBe(200);
    expect(rows).toHaveLength(0);
    expect(syncJson).toHaveBeenCalledWith('gases.json', []);
  });
});
