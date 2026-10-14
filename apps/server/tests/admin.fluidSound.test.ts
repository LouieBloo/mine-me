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

let fluids: any[] = [];
let sounds: any[] = [];
vi.mock('../src/index', () => ({
  prisma: {
    fluid: {
      findMany: vi.fn().mockImplementation(() => Promise.resolve(fluids)),
      findFirst: vi.fn().mockImplementation(({ where }) => Promise.resolve(fluids.find((f) => where.OR.some((c: any) => c.id === f.id || c.typeKey === f.typeKey)) ?? null)),
      update: vi.fn().mockImplementation(({ where, data }) => {
        const i = fluids.findIndex((f) => f.id === where.id);
        fluids[i] = { ...fluids[i], ...data };
        return Promise.resolve(fluids[i]);
      }),
    },
    sound: { findUnique: vi.fn().mockImplementation(({ where }) => Promise.resolve(sounds.find((s) => s.id === where.id) ?? null)) },
  },
}));

import { adminRouter } from '../src/routes/admin';

const app = express();
app.use(express.json());
app.use('/admin', adminRouter);
const patch = (slot: string, body: object, id = 'f1') => request(app).patch(`/admin/fluids/${id}/sound-effects/${slot}`).send(body);

describe('admin fluid sound slots', () => {
  beforeEach(() => {
    fluids = [{ id: 'f1', typeKey: 'OIL', name: 'Oil', soundEffects: null }];
    sounds = [{ id: 's1', url: '/assets/sounds/splash.mp3' }, { id: 's2', url: '/assets/sounds/other.mp3' }];
    syncJson.mockClear();
  });

  it('points a slot at a library sound and mirrors the change', async () => {
    const res = await patch('enter', { soundId: 's1' });
    expect(res.status).toBe(200);
    expect(fluids[0].soundEffects).toEqual({ enter: { soundId: 's1' } });
    expect(syncJson).toHaveBeenCalledWith('fluids.json', expect.any(Array));
  });

  it('finds the fluid by its key as well as its id', async () => {
    expect((await patch('exit', { soundId: 's1' }, 'oil')).status).toBe(200);
  });

  it('sets the volume of this fluid\'s use alone, keeping the sound; changing the sound keeps the volume', async () => {
    await patch('enter', { soundId: 's1' });
    await patch('enter', { volume: 0.25 });
    expect(fluids[0].soundEffects.enter).toEqual({ soundId: 's1', volume: 0.25 });
    await patch('enter', { soundId: 's2' });
    expect(fluids[0].soundEffects.enter).toEqual({ soundId: 's2', volume: 0.25 });
  });

  it('refuses a volume sent for an empty slot', async () => {
    const res = await patch('ignite', { volume: 0.5 });
    expect(res.status).toBe(400);
    expect(fluids[0].soundEffects).toBeNull();
  });

  it('rejects a volume outside 0 to 1', async () => {
    await patch('enter', { soundId: 's1' });
    for (const volume of [-0.1, 1.5, 'loud']) expect((await patch('enter', { volume })).status).toBe(400);
    expect(fluids[0].soundEffects.enter.volume).toBeUndefined();
  });

  it('clears a slot with null, and the whole column becomes a database null when none are left', async () => {
    await patch('enter', { soundId: 's1' });
    await patch('exit', { soundId: 's1' });
    await patch('enter', { soundId: null });
    expect(fluids[0].soundEffects).toEqual({ exit: { soundId: 's1' } });
    await patch('exit', { soundId: null });
    expect(fluids[0].soundEffects).toBe(Prisma.JsonNull);
  });

  it('keeps the burn loop looping by default and does not let it be switched off (only the fixed slots may loop)', async () => {
    await patch('burn', { soundId: 's1', loop: false });
    expect(fluids[0].soundEffects.burn).toEqual({ soundId: 's1' });
  });

  it('rejects an unknown slot, a missing fluid, a missing sound and a bad sound id', async () => {
    expect((await patch('dig', { soundId: 's1' })).status).toBe(400);
    expect((await patch('enter', { soundId: 's1' }, 'nope')).status).toBe(404);
    expect((await patch('enter', { soundId: 'ghost' })).status).toBe(404);
    expect((await patch('enter', { soundId: '' })).status).toBe(400);
    expect(fluids[0].soundEffects).toBeNull();
  });
});
