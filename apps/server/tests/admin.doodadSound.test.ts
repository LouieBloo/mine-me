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

let doodads: any[] = [];
let sounds: any[] = [];
vi.mock('../src/index', () => ({
  prisma: {
    doodad: {
      findMany: vi.fn().mockImplementation(() => Promise.resolve(doodads)),
      findFirst: vi.fn().mockImplementation(({ where }) => Promise.resolve(doodads.find((f) => where.OR.some((c: any) => c.id === f.id || c.key === f.key)) ?? null)),
      update: vi.fn().mockImplementation(({ where, data }) => {
        const i = doodads.findIndex((f) => f.id === where.id);
        doodads[i] = { ...doodads[i], ...data };
        return Promise.resolve(doodads[i]);
      }),
    },
    sound: { findUnique: vi.fn().mockImplementation(({ where }) => Promise.resolve(sounds.find((s) => s.id === where.id) ?? null)) },
  },
}));

import { adminRouter } from '../src/routes/admin';

const app = express();
app.use(express.json());
app.use('/admin', adminRouter);
const patch = (slot: string, body: object, id = 'd1') => request(app).patch(`/admin/doodads/${id}/sound-effects/${slot}`).send(body);

describe('admin doodad sound slots', () => {
  beforeEach(() => {
    doodads = [{ id: 'd1', key: 'glow_mushroom', name: 'Glow Mushroom', soundEffects: null, biomes: [] }];
    sounds = [{ id: 's1', url: '/assets/sounds/drip.mp3' }, { id: 's2', url: '/assets/sounds/other.mp3' }];
    syncJson.mockClear();
  });

  it('points a slot at a library sound and mirrors the change in the shared shape', async () => {
    const res = await patch('react', { soundId: 's1' });
    expect(res.status).toBe(200);
    expect(res.body.soundEffects).toEqual({ react: { soundId: 's1' } });
    expect(doodads[0].soundEffects).toEqual({ react: { soundId: 's1' } });
    expect(syncJson).toHaveBeenCalledWith('doodads.json', [expect.objectContaining({ key: 'glow_mushroom', biomes: [] })]);
  });

  it('finds the doodad by its key as well as its id', async () => {
    expect((await patch('break', { soundId: 's1' }, 'glow_mushroom')).status).toBe(200);
  });

  it('sets the volume of this doodad\'s use alone, keeping the sound; changing the sound keeps the volume', async () => {
    await patch('react', { soundId: 's1' });
    await patch('react', { volume: 0.25 });
    expect(doodads[0].soundEffects.react).toEqual({ soundId: 's1', volume: 0.25 });
    await patch('react', { soundId: 's2' });
    expect(doodads[0].soundEffects.react).toEqual({ soundId: 's2', volume: 0.25 });
  });

  it('refuses a volume sent for an empty slot', async () => {
    const res = await patch('break', { volume: 0.5 });
    expect(res.status).toBe(400);
    expect(doodads[0].soundEffects).toBeNull();
  });

  it('rejects a volume outside 0 to 1', async () => {
    await patch('react', { soundId: 's1' });
    for (const volume of [-0.1, 1.5, 'loud']) expect((await patch('react', { volume })).status).toBe(400);
    expect(doodads[0].soundEffects.react.volume).toBeUndefined();
  });

  it('clears a slot with null, and the whole column becomes a database null when none are left', async () => {
    await patch('react', { soundId: 's1' });
    await patch('break', { soundId: 's1' });
    await patch('react', { soundId: null });
    expect(doodads[0].soundEffects).toEqual({ break: { soundId: 's1' } });
    await patch('break', { soundId: null });
    expect(doodads[0].soundEffects).toBe(Prisma.JsonNull);
  });

  it('lets only the ambient slot loop', async () => {
    await patch('ambient', { soundId: 's1', loop: true });
    expect(doodads[0].soundEffects.ambient).toEqual({ soundId: 's1', loop: true });
    await patch('react', { soundId: 's1', loop: true });
    expect(doodads[0].soundEffects.react).toEqual({ soundId: 's1' });
  });

  it('rejects an unknown slot, a missing doodad, a missing sound and a bad sound id', async () => {
    expect((await patch('splash', { soundId: 's1' })).status).toBe(400);
    expect((await patch('react', { soundId: 's1' }, 'nope')).status).toBe(404);
    expect((await patch('react', { soundId: 'ghost' })).status).toBe(404);
    expect((await patch('react', { soundId: '' })).status).toBe(400);
    expect(doodads[0].soundEffects).toBeNull();
  });
});
