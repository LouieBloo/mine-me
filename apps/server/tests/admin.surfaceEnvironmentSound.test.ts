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

let envs: any[] = [];
let sounds: any[] = [];
vi.mock('../src/index', () => ({
  prisma: {
    surfaceEnvironment: {
      findMany: vi.fn().mockImplementation(() => Promise.resolve(envs)),
      findFirst: vi.fn().mockImplementation(({ where }) => Promise.resolve(envs.find((f) => where.OR.some((c: any) => c.id === f.id || c.key === f.key)) ?? null)),
      update: vi.fn().mockImplementation(({ where, data }) => {
        const i = envs.findIndex((f) => f.id === where.id);
        envs[i] = { ...envs[i], ...data };
        return Promise.resolve(envs[i]);
      }),
    },
    sound: { findUnique: vi.fn().mockImplementation(({ where }) => Promise.resolve(sounds.find((s) => s.id === where.id) ?? null)) },
  },
}));

import { adminRouter } from '../src/routes/admin';

const app = express();
app.use(express.json());
app.use('/admin', adminRouter);
const patch = (slot: string, body: object, id = 'e1') => request(app).patch(`/admin/surface-environments/${id}/sound-effects/${slot}`).send(body);

describe('admin surface environment sound slots', () => {
  beforeEach(() => {
    envs = [{ id: 'e1', key: 'green_valley', name: 'Valley', soundEffects: null }];
    sounds = [{ id: 's1', url: '/assets/sounds/rain.mp3' }, { id: 's2', url: '/assets/sounds/wind.mp3' }];
    syncJson.mockClear();
  });

  it('points a slot at a library sound and mirrors the change', async () => {
    const res = await patch('rain', { soundId: 's1' });
    expect(res.status).toBe(200);
    expect(res.body.soundEffects).toEqual({ rain: { soundId: 's1' } });
    expect(syncJson).toHaveBeenCalledWith('surface_environments.json', expect.any(Array));
  });

  it('finds the environment by its key as well as its id', async () => {
    expect((await patch('thunder', { soundId: 's1' }, 'green_valley')).status).toBe(200);
  });

  it('sets this environment\'s volume alone, keeping the sound; changing the sound keeps the volume', async () => {
    await patch('wind', { soundId: 's1' });
    await patch('wind', { volume: 0.3 });
    expect(envs[0].soundEffects.wind).toEqual({ soundId: 's1', volume: 0.3 });
    await patch('wind', { soundId: 's2' });
    expect(envs[0].soundEffects.wind).toEqual({ soundId: 's2', volume: 0.3 });
  });

  it('rejects an unknown slot, an unknown sound, a bad volume and a volume for an empty slot', async () => {
    expect((await patch('ambient', { soundId: 's1' })).status).toBe(400);
    expect((await patch('rain', { soundId: 'gone' })).status).toBe(404);
    expect((await patch('rain', { volume: 0.5 })).status).toBe(400);
    await patch('rain', { soundId: 's1' });
    for (const volume of [-0.1, 1.5, 'loud']) expect((await patch('rain', { volume })).status).toBe(400);
    expect((await patch('rain', { soundId: 's1' }, 'nope')).status).toBe(404);
  });

  it('clears a slot with null, and the column becomes a database null when none are left', async () => {
    await patch('rain', { soundId: 's1' });
    await patch('wind', { soundId: 's2' });
    await patch('rain', { soundId: null });
    expect(envs[0].soundEffects).toEqual({ wind: { soundId: 's2' } });
    await patch('wind', { soundId: null });
    expect(envs[0].soundEffects).toBe(Prisma.JsonNull);
  });

  it('does not let any slot loop by an admin flag (the loops follow the weather)', async () => {
    await patch('rain', { soundId: 's1', loop: true });
    expect(envs[0].soundEffects.rain).toEqual({ soundId: 's1' });
  });
});
