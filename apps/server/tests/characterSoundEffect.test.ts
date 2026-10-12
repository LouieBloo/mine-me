import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { adminRouter } from '../src/routes/admin';

vi.mock('../src/middleware/auth', () => ({
  adminMiddleware: (req: any, res: any, next: any) => next(),
  authenticateToken: (req: any, res: any, next: any) => next(),
}));
vi.mock('../src/services/admin.service', async () => {
  const actual: any = await vi.importActual('../src/services/admin.service');
  return { ...actual, syncJson: vi.fn() };
});

let config: any = null;
let sounds: any[] = [];

vi.mock('../src/index', () => ({
  prisma: {
    characterSoundConfig: {
      findUnique: vi.fn(async () => config),
      upsert: vi.fn(async ({ create, update }) => {
        config = config ? { ...config, ...update } : { ...create };
        return config;
      }),
    },
    sound: {
      findUnique: vi.fn(async ({ where }) => sounds.find((s) => s.id === where.id) ?? null),
    },
  },
}));

const app = express();
app.use(express.json());
app.use('/api/admin', adminRouter);

describe('Character sound slots', () => {
  beforeEach(() => {
    config = null;
    sounds = [{ id: 'snd1', name: 'Ouch', url: '/assets/sounds/ouch.mp3', isActive: true }];
  });

  it('starts with no sounds', async () => {
    const res = await request(app).get('/api/admin/character-sounds');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ soundEffects: {} });
  });

  it('points a slot at a library sound and returns all slots', async () => {
    const res = await request(app).patch('/api/admin/character-sounds/hurt').send({ soundId: 'snd1' });
    expect(res.status).toBe(200);
    expect(res.body.soundEffects).toEqual({ hurt: { soundId: 'snd1' } });
    expect(config.id).toBe('default');
    expect((await request(app).get('/api/admin/character-sounds')).body.soundEffects.hurt.soundId).toBe('snd1');
  });

  it('keeps the other slots when one changes, and clears a slot with null', async () => {
    await request(app).patch('/api/admin/character-sounds/hurt').send({ soundId: 'snd1' });
    await request(app).patch('/api/admin/character-sounds/jump').send({ soundId: 'snd1' });
    const cleared = await request(app).patch('/api/admin/character-sounds/hurt').send({ soundId: null });
    expect(cleared.status).toBe(200);
    expect(cleared.body.soundEffects).toEqual({ jump: { soundId: 'snd1' } });
  });

  it('rejects an unknown slot without saving', async () => {
    const res = await request(app).patch('/api/admin/character-sounds/dig').send({ soundId: 'snd1' });
    expect(res.status).toBe(400);
    expect(config).toBeNull();
  });

  it('rejects a sound that is not in the library, and a malformed id', async () => {
    const missing = await request(app).patch('/api/admin/character-sounds/land').send({ soundId: 'nope' });
    expect(missing.status).toBe(404);
    const bad = await request(app).patch('/api/admin/character-sounds/land').send({ soundId: 42 });
    expect(bad.status).toBe(400);
    expect(config).toBeNull();
  });

  it('reports a database failure as an error the admin can see', async () => {
    const prisma = (await import('../src/index')).prisma as any;
    prisma.characterSoundConfig.findUnique.mockRejectedValueOnce(new Error('db down'));
    const res = await request(app).get('/api/admin/character-sounds');
    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/db down/);
  });

  describe('per-slot volume', () => {
    it('sets the volume with the sound, alone, and keeps it when the sound is swapped', async () => {
      const first = await request(app).patch('/api/admin/character-sounds/jump').send({ soundId: 'snd1', volume: 0.35 });
      expect(first.body.soundEffects).toEqual({ jump: { soundId: 'snd1', volume: 0.35 } });

      const only = await request(app).patch('/api/admin/character-sounds/jump').send({ volume: 0.8 });
      expect(only.body.soundEffects.jump).toEqual({ soundId: 'snd1', volume: 0.8 });

      const swapped = await request(app).patch('/api/admin/character-sounds/jump').send({ soundId: 'snd1' });
      expect(swapped.body.soundEffects.jump.volume).toBe(0.8);
    });

    it('gives each slot its own volume for the same sound', async () => {
      await request(app).patch('/api/admin/character-sounds/jump').send({ soundId: 'snd1', volume: 0.2 });
      const res = await request(app).patch('/api/admin/character-sounds/hurt').send({ soundId: 'snd1', volume: 1 });
      expect(res.body.soundEffects.jump.volume).toBe(0.2);
      expect(res.body.soundEffects.hurt.volume).toBe(1);
    });

    it.each([[-1], [3], ['quiet'], [null]])('rejects volume %s without saving', async (volume) => {
      const res = await request(app).patch('/api/admin/character-sounds/jump').send({ soundId: 'snd1', volume });
      expect(res.status).toBe(400);
      expect(config).toBeNull();
    });

    it('rejects a volume for an empty slot', async () => {
      const res = await request(app).patch('/api/admin/character-sounds/land').send({ volume: 0.5 });
      expect(res.status).toBe(400);
    });
  });
});
