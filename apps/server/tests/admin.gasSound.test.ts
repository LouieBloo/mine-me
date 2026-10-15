import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { Prisma } from '@prisma/client';

vi.mock('../src/middleware/auth', () => ({
  adminMiddleware: (_req: any, _res: any, next: any) => next(),
  authenticateToken: (_req: any, _res: any, next: any) => next(),
}));
const { syncJson } = vi.hoisted(() => ({ syncJson: vi.fn() }));
vi.mock('../src/services/admin.service', async () => ({ ...(await vi.importActual<any>('../src/services/admin.service')), syncJson }));

let gases: any[] = [];
let sounds: any[] = [];
vi.mock('../src/index', () => ({
  prisma: {
    gas: {
      findMany: vi.fn().mockImplementation(() => Promise.resolve(gases)),
      findFirst: vi.fn().mockImplementation(({ where }) => Promise.resolve(gases.find((f) => where.OR.some((c: any) => c.id === f.id || c.typeKey === f.typeKey)) ?? null)),
      update: vi.fn().mockImplementation(({ where, data }) => {
        const i = gases.findIndex((f) => f.id === where.id);
        gases[i] = { ...gases[i], ...data };
        return Promise.resolve(gases[i]);
      }),
    },
    sound: { findUnique: vi.fn().mockImplementation(({ where }) => Promise.resolve(sounds.find((s) => s.id === where.id) ?? null)) },
  },
}));

import { adminRouter } from '../src/routes/admin';

const app = express();
app.use(express.json());
app.use('/admin', adminRouter);
const patch = (slot: string, body: object, id = 'g1') => request(app).patch(`/admin/gases/${id}/sound-effects/${slot}`).send(body);

describe('admin gas sound slots', () => {
  beforeEach(() => {
    gases = [{ id: 'g1', typeKey: 'HYDROGEN', name: 'Hydrogen', soundEffects: null }];
    sounds = [{ id: 's1', url: '/assets/sounds/splash.mp3' }, { id: 's2', url: '/assets/sounds/other.mp3' }];
    syncJson.mockClear();
  });

  it('points a slot at a library sound and mirrors the change', async () => {
    const res = await patch('enter', { soundId: 's1' });
    expect(res.status).toBe(200);
    expect(gases[0].soundEffects).toEqual({ enter: { soundId: 's1' } });
    expect(syncJson).toHaveBeenCalledWith('gases.json', expect.any(Array));
  });

  it('finds the gas by its key as well as its id', async () => {
    expect((await patch('exit', { soundId: 's1' }, 'hydrogen')).status).toBe(200);
  });

  it('sets the volume of this gas\'s use alone, keeping the sound; changing the sound keeps the volume', async () => {
    await patch('enter', { soundId: 's1' });
    await patch('enter', { volume: 0.25 });
    expect(gases[0].soundEffects.enter).toEqual({ soundId: 's1', volume: 0.25 });
    await patch('enter', { soundId: 's2' });
    expect(gases[0].soundEffects.enter).toEqual({ soundId: 's2', volume: 0.25 });
  });

  it('refuses a volume sent for an empty slot', async () => {
    const res = await patch('vent', { volume: 0.5 });
    expect(res.status).toBe(400);
    expect(gases[0].soundEffects).toBeNull();
  });

  it('rejects a volume outside 0 to 1', async () => {
    await patch('enter', { soundId: 's1' });
    for (const volume of [-0.1, 1.5, 'loud']) expect((await patch('enter', { volume })).status).toBe(400);
    expect(gases[0].soundEffects.enter.volume).toBeUndefined();
  });

  it('clears a slot with null, and the whole column becomes a database null when none are left', async () => {
    await patch('enter', { soundId: 's1' });
    await patch('exit', { soundId: 's1' });
    await patch('enter', { soundId: null });
    expect(gases[0].soundEffects).toEqual({ exit: { soundId: 's1' } });
    await patch('exit', { soundId: null });
    expect(gases[0].soundEffects).toBe(Prisma.JsonNull);
  });

  it('does not let any gas slot be set to loop (none of them are loop slots)', async () => {
    await patch('explode', { soundId: 's1', loop: true });
    expect(gases[0].soundEffects.explode).toEqual({ soundId: 's1' });
  });

  it('rejects an unknown slot, a missing gas, a missing sound and a bad sound id', async () => {
    expect((await patch('splash', { soundId: 's1' })).status).toBe(400);
    expect((await patch('enter', { soundId: 's1' }, 'nope')).status).toBe(404);
    expect((await patch('enter', { soundId: 'ghost' })).status).toBe(404);
    expect((await patch('enter', { soundId: '' })).status).toBe(400);
    expect(gases[0].soundEffects).toBeNull();
  });
});
