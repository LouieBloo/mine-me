import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import fs from 'fs';
import { adminRouter } from '../src/routes/admin';
import { getSoundsDir } from '../src/config/assetPaths';

vi.mock('../src/middleware/auth', () => ({
  adminMiddleware: (req: any, res: any, next: any) => next(),
  authenticateToken: (req: any, res: any, next: any) => next(),
}));
vi.mock('../src/services/admin.service', async () => {
  const actual: any = await vi.importActual('../src/services/admin.service');
  return { ...actual, syncJson: vi.fn() };
});

let mobs: any[] = [];
let sounds: any[] = [];

vi.mock('../src/index', () => ({
  prisma: {
    mob: {
      findUnique: vi.fn(async ({ where }) => mobs.find((m) => m.id === where.id) ?? null),
      findMany: vi.fn(async () => mobs),
      update: vi.fn(async ({ where, data }) => {
        const mob = mobs.find((m) => m.id === where.id);
        Object.assign(mob, data);
        return mob;
      }),
    },
    sound: {
      findUnique: vi.fn(async ({ where }) => sounds.find((s) => s.id === where.id) ?? null),
      findMany: vi.fn(async () => sounds),
      findFirst: vi.fn(async ({ where }) => sounds.find((s) => s.url === where.url) ?? null),
      create: vi.fn(async ({ data }) => {
        const row = { id: `s${sounds.length + 1}`, ...data };
        sounds.push(row);
        return row;
      }),
      update: vi.fn(async ({ where, data }) => Object.assign(sounds.find((s) => s.id === where.id), data)),
    },
  },
}));

const app = express();
app.use(express.json());
app.use('/api/admin', adminRouter);

describe('Mob sound slots', () => {
  beforeEach(() => {
    mobs = [{ id: 'mob1', name: 'Mole', soundEffects: null }];
    sounds = [{ id: 'snd1', name: 'Growl', url: '/assets/sounds/growl.mp3', isActive: true }];
  });

  it('points a slot at a library sound', async () => {
    const res = await request(app).patch('/api/admin/mobs/mob1/sound-effects/attack').send({ soundId: 'snd1' });
    expect(res.status).toBe(200);
    expect(mobs[0].soundEffects).toEqual({ attack: { soundId: 'snd1' } });
  });

  describe('per-mob volume', () => {
    it('sets the volume of a slot together with its sound', async () => {
      const res = await request(app).patch('/api/admin/mobs/mob1/sound-effects/attack').send({ soundId: 'snd1', volume: 0.4 });
      expect(res.status).toBe(200);
      expect(mobs[0].soundEffects).toEqual({ attack: { soundId: 'snd1', volume: 0.4 } });
    });

    it('changes only the volume of an assigned sound', async () => {
      mobs[0].soundEffects = { attack: { soundId: 'snd1' } };
      const res = await request(app).patch('/api/admin/mobs/mob1/sound-effects/attack').send({ volume: 0.25 });
      expect(res.status).toBe(200);
      expect(mobs[0].soundEffects).toEqual({ attack: { soundId: 'snd1', volume: 0.25 } });
    });

    it('keeps the volume when the sound is swapped', async () => {
      mobs[0].soundEffects = { attack: { soundId: 'other', volume: 0.5 } };
      await request(app).patch('/api/admin/mobs/mob1/sound-effects/attack').send({ soundId: 'snd1' });
      expect(mobs[0].soundEffects).toEqual({ attack: { soundId: 'snd1', volume: 0.5 } });
    });

    it('sets a different volume for the same sound on another slot', async () => {
      await request(app).patch('/api/admin/mobs/mob1/sound-effects/attack').send({ soundId: 'snd1', volume: 0.2 });
      await request(app).patch('/api/admin/mobs/mob1/sound-effects/death').send({ soundId: 'snd1', volume: 0.9 });
      expect(mobs[0].soundEffects.attack.volume).toBe(0.2);
      expect(mobs[0].soundEffects.death.volume).toBe(0.9);
    });

    it('accepts 0 (silent) and 1', async () => {
      expect((await request(app).patch('/api/admin/mobs/mob1/sound-effects/dig').send({ soundId: 'snd1', volume: 0 })).status).toBe(200);
      expect(mobs[0].soundEffects.dig.volume).toBe(0);
      expect((await request(app).patch('/api/admin/mobs/mob1/sound-effects/dig').send({ volume: 1 })).status).toBe(200);
      expect(mobs[0].soundEffects.dig.volume).toBe(1);
    });

    it.each([[-0.1], [1.5], ['loud'], [null], [NaN]])('rejects volume %s without saving', async (volume) => {
      const res = await request(app).patch('/api/admin/mobs/mob1/sound-effects/attack').send({ soundId: 'snd1', volume });
      expect(res.status).toBe(400);
      expect(mobs[0].soundEffects).toBeNull();
    });

    it('rejects a volume for a slot that has no sound yet', async () => {
      const res = await request(app).patch('/api/admin/mobs/mob1/sound-effects/attack').send({ volume: 0.5 });
      expect(res.status).toBe(400);
      expect(mobs[0].soundEffects).toBeNull();
    });
  });

  it('keeps the other slots when one changes', async () => {
    mobs[0].soundEffects = { dig: { soundId: 'snd1' } };
    await request(app).patch('/api/admin/mobs/mob1/sound-effects/death').send({ soundId: 'snd1' });
    expect(Object.keys(mobs[0].soundEffects).sort()).toEqual(['death', 'dig']);
  });

  it('clears a slot with soundId null', async () => {
    mobs[0].soundEffects = { dig: { soundId: 'snd1' }, idle: { soundId: 'snd1' } };
    const res = await request(app).patch('/api/admin/mobs/mob1/sound-effects/dig').send({ soundId: null });
    expect(res.status).toBe(200);
    expect(mobs[0].soundEffects).toEqual({ idle: { soundId: 'snd1' } });
  });

  it.each([
    ['unknown slot', '/api/admin/mobs/mob1/sound-effects/fly', { soundId: 'snd1' }, 400],
    ['unknown sound', '/api/admin/mobs/mob1/sound-effects/dig', { soundId: 'nope' }, 404],
    ['bad soundId type', '/api/admin/mobs/mob1/sound-effects/dig', { soundId: 5 }, 400],
    ['unknown mob', '/api/admin/mobs/ghost/sound-effects/dig', { soundId: 'snd1' }, 404],
  ])('rejects %s', async (_n, url, body, status) => {
    const res = await request(app).patch(url).send(body);
    expect(res.status).toBe(status);
    expect(mobs[0].soundEffects).toBeNull();
  });

  it('has no upload endpoint of its own any more (sounds are uploaded to the library)', async () => {
    const res = await request(app)
      .post('/api/admin/mobs/mob1/sound-effects/death')
      .attach('soundEffect', Buffer.from('ID3fake'), 'roar.mp3');
    expect(res.status).toBe(404);
    expect(mobs[0].soundEffects).toBeNull();
  });

  it('mob save normalizes soundEffects and never stores the resolved `sounds`', async () => {
    const res = await request(app)
      .put('/api/admin/mobs/mob1')
      .send({
        name: 'Mole',
        soundEffects: { dig: { soundId: 'snd1', url: '/evil.mp3' }, fly: { soundId: 'snd1' } },
        sounds: { dig: { url: '/assets/sounds/x.mp3' } },
      });
    expect(res.status).toBe(200);
    expect(mobs[0].soundEffects).toEqual({ dig: { soundId: 'snd1' } });
    expect(mobs[0].sounds).toBeUndefined();
  });
});
