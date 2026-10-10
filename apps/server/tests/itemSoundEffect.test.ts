import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { adminRouter } from '../src/routes/admin';
import { prisma } from '../src/index';

// Mock auth middleware
vi.mock('../src/middleware/auth', () => ({
  adminMiddleware: (req: any, res: any, next: any) => next(),
  authenticateToken: (req: any, res: any, next: any) => next(),
}));

// Mock syncJson
vi.mock('../src/services/admin.service', async () => {
  const actual: any = await vi.importActual('../src/services/admin.service');
  return {
    ...actual,
    syncJson: vi.fn().mockResolvedValue(true),
  };
});

let mockItems: any[] = [];

vi.mock('../src/index', () => ({
  prisma: {
    sound: {
      findFirst: vi.fn().mockResolvedValue(null),
      findUnique: vi.fn().mockImplementation(({ where }) =>
        Promise.resolve(where.id === 'lib_1' ? { id: 'lib_1', name: 'Pistol', url: '/assets/sounds/items/pistol.wav' } : null)
      ),
      create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 's1', ...data })),
      update: vi.fn(),
      deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    item: {
      findUnique: vi.fn().mockImplementation(({ where }) => {
        const found = mockItems.find((i) => i.id === where.id);
        return Promise.resolve(found ? { ...found } : null);
      }),
      update: vi.fn().mockImplementation(({ where, data }) => {
        const idx = mockItems.findIndex((i) => i.id === where.id);
        if (idx !== -1) {
          mockItems[idx] = { ...mockItems[idx], ...data, updatedAt: new Date() };
          return Promise.resolve({ ...mockItems[idx], itemEffects: [], particleEffect: null });
        }
        return Promise.reject(new Error('Item not found'));
      }),
      findMany: vi.fn().mockImplementation(() => Promise.resolve([...mockItems])),
    },
  },
}));

const app = express();
app.use(express.json());
app.use('/api/admin', adminRouter);

describe('Item Sound Effect Endpoints', () => {
  beforeEach(() => {
    mockItems = [
      {
        id: 'item_pickaxe_1',
        name: 'Iron Pickaxe',
        description: 'Mines stone and ores',
        type: 'GEAR',
        subType: 'WEAPON',
        soundEffectUrl: null,
      },
    ];
  });

  it('assigns a library sound to the legacy single sound field via the throw slot', async () => {
    const res = await request(app)
      .patch('/api/admin/items/item_pickaxe_1/sound-effects/throw')
      .send({ soundId: 'lib_1' });

    expect(res.status).toBe(200);
    expect(res.body.soundEffectUrl).toBe('/assets/sounds/items/pistol.wav');
    expect(mockItems[0].soundEffectUrl).toBe('/assets/sounds/items/pistol.wav');
  });

  it('returns 404 when the item does not exist', async () => {
    const res = await request(app)
      .patch('/api/admin/items/non_existent_item/sound-effects/throw')
      .send({ soundId: 'lib_1' });
    expect(res.status).toBe(404);
  });

  it('has no upload or remove endpoints of its own any more (sounds are uploaded to the library)', async () => {
    const calls = [
      request(app).post('/api/admin/items/item_pickaxe_1/sound-effect').attach('soundEffect', Buffer.from('x'), 'a.wav'),
      request(app).post('/api/admin/items/item_pickaxe_1/sound-effects/reload').attach('soundEffect', Buffer.from('x'), 'a.wav'),
      request(app).delete('/api/admin/items/item_pickaxe_1/sound-effect'),
      request(app).delete('/api/admin/items/item_pickaxe_1/sound-effects/reload'),
    ];
    for (const res of await Promise.all(calls)) expect(res.status).toBe(404);
  });

  describe('Multi-Slot Sound Effects (e.g. Dynamite)', () => {
    beforeEach(() => {
      mockItems.push({
        id: 'item_dynamite_1',
        name: 'Dynamite Stick',
        description: 'Explosive mining charge',
        type: 'CONSUMABLE',
        subType: 'DYNAMITE',
        soundEffectUrl: null,
        soundEffects: null,
      });
    });

    it('should patch loop setting for a sound slot via PATCH endpoint', async () => {
      const dynamite = mockItems.find((i) => i.id === 'item_dynamite_1');
      dynamite.soundEffects = {
        inGameEffect: {
          url: '/assets/sounds/items/item_dynamite_1_inGameEffect_sfx.wav',
          loop: true,
        },
      };

      const res = await request(app)
        .patch('/api/admin/items/item_dynamite_1/sound-effects/inGameEffect')
        .send({ loop: false });

      expect(res.status).toBe(200);
      expect(res.body.soundEffects?.inGameEffect?.loop).toBe(false);
      expect(res.body.soundEffects?.inGameEffect?.url).toBe(
        '/assets/sounds/items/item_dynamite_1_inGameEffect_sfx.wav'
      );
    });

    describe('choosing a sound from the library', () => {
      beforeEach(() => {
        (prisma as any).sound.create.mockClear();
        (prisma as any).sound.deleteMany.mockClear();
      });

      it('points the slot at a library sound without uploading anything', async () => {
        const res = await request(app)
          .patch('/api/admin/items/item_dynamite_1/sound-effects/explosion')
          .send({ soundId: 'lib_1' });

        expect(res.status).toBe(200);
        expect(res.body.soundEffects.explosion.url).toBe('/assets/sounds/items/pistol.wav');
        expect((prisma as any).sound.create).not.toHaveBeenCalled();
      });

      it('keeps the legacy soundEffectUrl in step for the throw slot', async () => {
        const res = await request(app)
          .patch('/api/admin/items/item_dynamite_1/sound-effects/throw')
          .send({ soundId: 'lib_1' });
        expect(res.body.soundEffectUrl).toBe('/assets/sounds/items/pistol.wav');
      });

      it('keeps the slot loop setting when the sound changes', async () => {
        const dynamite = mockItems.find((i) => i.id === 'item_dynamite_1');
        dynamite.soundEffects = { inGameEffect: { url: '/assets/sounds/items/old.wav', loop: true } };
        const res = await request(app)
          .patch('/api/admin/items/item_dynamite_1/sound-effects/inGameEffect')
          .send({ soundId: 'lib_1' });
        expect(res.body.soundEffects.inGameEffect).toEqual({ url: '/assets/sounds/items/pistol.wav', loop: true });
      });

      it('clears a slot with soundId null but never deletes the file or its library row', async () => {
        const dynamite = mockItems.find((i) => i.id === 'item_dynamite_1');
        dynamite.soundEffects = { explosion: { url: '/assets/sounds/items/pistol.wav', loop: false } };
        const res = await request(app)
          .patch('/api/admin/items/item_dynamite_1/sound-effects/explosion')
          .send({ soundId: null });

        expect(res.status).toBe(200);
        expect(res.body.soundEffects.explosion.url).toBeNull();
        expect((prisma as any).sound.deleteMany).not.toHaveBeenCalled();
      });

      it('rejects an unknown sound and a malformed id', async () => {
        const missing = await request(app)
          .patch('/api/admin/items/item_dynamite_1/sound-effects/explosion')
          .send({ soundId: 'nope' });
        expect(missing.status).toBe(404);

        const bad = await request(app)
          .patch('/api/admin/items/item_dynamite_1/sound-effects/explosion')
          .send({ soundId: 42 });
        expect(bad.status).toBe(400);
      });
    });
  });
});
