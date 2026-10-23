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

let extractors: any[] = [];
let sounds: any[] = [];
vi.mock('../src/index', () => ({
  prisma: {
    extractor: {
      findMany: vi.fn().mockImplementation(() => Promise.resolve(extractors)),
      findFirst: vi.fn().mockImplementation(({ where }) => Promise.resolve(extractors.find((e) => where.OR.some((c: any) => c.id === e.id || c.key === e.key)) ?? null)),
      update: vi.fn().mockImplementation(({ where, data }) => {
        const i = extractors.findIndex((e) => e.id === where.id);
        extractors[i] = { ...extractors[i], ...data };
        return Promise.resolve(extractors[i]);
      }),
    },
    sound: { findUnique: vi.fn().mockImplementation(({ where }) => Promise.resolve(sounds.find((s) => s.id === where.id) ?? null)) },
  },
}));

import { adminRouter } from '../src/routes/admin';

const app = express();
app.use(express.json());
app.use('/admin', adminRouter);
const patch = (slot: string, body: object, id = 'e1') => request(app).patch(`/admin/extractors/${id}/sound-effects/${slot}`).send(body);

describe('admin extractor sound slots', () => {
  beforeEach(() => {
    extractors = [{ id: 'e1', key: 'basic_extractor', name: 'Basic', soundEffects: null }];
    sounds = [{ id: 's1', url: '/assets/sounds/land.mp3' }, { id: 's2', url: '/assets/sounds/other.mp3' }];
    syncJson.mockClear();
  });

  it('points a slot at a library sound and mirrors the change', async () => {
    const res = await patch('landing', { soundId: 's1' });
    expect(res.status).toBe(200);
    expect(extractors[0].soundEffects).toEqual({ landing: { soundId: 's1' } });
    expect(syncJson).toHaveBeenCalledWith('extractors.json', expect.any(Array));
  });

  it('finds the extractor by its key as well as its id', async () => {
    expect((await patch('unload', { soundId: 's1' }, 'basic_extractor')).status).toBe(200);
  });

  it('sets the volume of this extractor\'s use alone, keeping the sound; changing the sound keeps the volume', async () => {
    await patch('landing', { soundId: 's1' });
    await patch('landing', { volume: 0.25 });
    expect(extractors[0].soundEffects.landing).toEqual({ soundId: 's1', volume: 0.25 });
    await patch('landing', { soundId: 's2' });
    expect(extractors[0].soundEffects.landing).toEqual({ soundId: 's2', volume: 0.25 });
  });

  it('refuses a volume for an empty slot, and a volume outside 0 to 1', async () => {
    expect((await patch('beltBreak', { volume: 0.5 })).status).toBe(400);
    await patch('landing', { soundId: 's1' });
    for (const volume of [-0.1, 1.5, 'loud']) expect((await patch('landing', { volume })).status).toBe(400);
    expect(extractors[0].soundEffects.landing.volume).toBeUndefined();
  });

  it('clears a slot with null, and the column becomes a database null when none are left', async () => {
    await patch('landing', { soundId: 's1' });
    await patch('unload', { soundId: 's1' });
    await patch('landing', { soundId: null });
    expect(extractors[0].soundEffects).toEqual({ unload: { soundId: 's1' } });
    await patch('unload', { soundId: null });
    expect(extractors[0].soundEffects).toBe(Prisma.JsonNull);
  });

  it('lets only the running slot loop', async () => {
    await patch('loop', { soundId: 's1', loop: false });
    expect(extractors[0].soundEffects.loop).toEqual({ soundId: 's1', loop: false });
    await patch('beltBreak', { soundId: 's1', loop: true });
    expect(extractors[0].soundEffects.beltBreak).toEqual({ soundId: 's1' });
  });

  it('rejects an unknown slot, a missing extractor, a missing sound and a bad sound id', async () => {
    expect((await patch('bogus', { soundId: 's1' })).status).toBe(400);
    expect((await patch('landing', { soundId: 's1' }, 'nope')).status).toBe(404);
    expect((await patch('landing', { soundId: 'ghost' })).status).toBe(404);
    expect((await patch('landing', { soundId: '' })).status).toBe(400);
    expect(extractors[0].soundEffects).toBeNull();
  });
});
