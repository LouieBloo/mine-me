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

  it('uploads a file into the library as a MOB sound and points the slot at it', async () => {
    const res = await request(app)
      .post('/api/admin/mobs/mob1/sound-effects/death')
      .attach('soundEffect', Buffer.from('ID3fake'), 'roar.mp3');
    expect(res.status).toBe(200);
    const created = sounds.find((s) => s.url === '/assets/sounds/mobs/mob1/mob1_death.mp3');
    expect(created).toMatchObject({ category: 'MOB', type: 'SFX', name: 'Mole - death' });
    expect(mobs[0].soundEffects).toEqual({ death: { soundId: created.id } });
    expect(fs.existsSync(getSoundsDir('mobs', 'mob1', 'mob1_death.mp3'))).toBe(true);
  });

  it('rejects uploads with no file, a bad slot or a non-audio file', async () => {
    expect((await request(app).post('/api/admin/mobs/mob1/sound-effects/death')).status).toBe(400);
    expect(
      (await request(app).post('/api/admin/mobs/mob1/sound-effects/fly').attach('soundEffect', Buffer.from('x'), 'a.mp3')).status
    ).toBe(400);
    const bad = await request(app)
      .post('/api/admin/mobs/mob1/sound-effects/death')
      .attach('soundEffect', Buffer.from('x'), { filename: 'a.txt', contentType: 'text/plain' });
    expect(bad.status).toBeGreaterThanOrEqual(400);
    expect(mobs[0].soundEffects).toBeNull();
  });

  it('does not write a file for an unknown mob', async () => {
    const res = await request(app)
      .post('/api/admin/mobs/ghost/sound-effects/death')
      .attach('soundEffect', Buffer.from('ID3fake'), 'roar.mp3');
    expect(res.status).toBe(404);
    expect(fs.existsSync(getSoundsDir('mobs', 'ghost', 'ghost_death.mp3'))).toBe(false);
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
