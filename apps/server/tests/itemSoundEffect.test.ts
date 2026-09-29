import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { adminRouter } from '../src/routes/admin';

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

  it('should upload a sound effect for a weapon item', async () => {
    const audioBuffer = Buffer.from('RIFF....WAVEfmt ....data....');

    const res = await request(app)
      .post('/api/admin/items/item_pickaxe_1/sound-effect')
      .attach('soundEffect', audioBuffer, 'pickaxe_hit.wav');

    expect(res.status).toBe(200);
    expect(res.body.soundEffectUrl).toMatch(/^\/assets\/sounds\/items\/item_pickaxe_1_sfx\.wav$/);
    expect(mockItems[0].soundEffectUrl).toMatch(/^\/assets\/sounds\/items\/item_pickaxe_1_sfx\.wav$/);
  });

  it('should return 400 when no file is uploaded', async () => {
    const res = await request(app)
      .post('/api/admin/items/item_pickaxe_1/sound-effect');

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('No sound effect file provided');
  });

  it('should return 404 when item is not found during upload', async () => {
    const audioBuffer = Buffer.from('fake-mp3-data');

    const res = await request(app)
      .post('/api/admin/items/non_existent_item/sound-effect')
      .attach('soundEffect', audioBuffer, 'swing.mp3');

    expect(res.status).toBe(404);
  });

  it('should remove a sound effect from an item', async () => {
    mockItems[0].soundEffectUrl = '/assets/sounds/items/item_pickaxe_1_sfx.wav';

    const res = await request(app)
      .delete('/api/admin/items/item_pickaxe_1/sound-effect');

    expect(res.status).toBe(200);
    expect(res.body.soundEffectUrl).toBeNull();
    expect(mockItems[0].soundEffectUrl).toBeNull();
  });

  it('should return 404 when removing sound effect from non-existent item', async () => {
    const res = await request(app)
      .delete('/api/admin/items/non_existent_item/sound-effect');

    expect(res.status).toBe(404);
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

    it('should upload sound effect to inGameEffect slot with loop: true', async () => {
      const audioBuffer = Buffer.from('RIFF....WAVEfmt ....data....');

      const res = await request(app)
        .post('/api/admin/items/item_dynamite_1/sound-effects/inGameEffect')
        .field('loop', 'true')
        .attach('soundEffect', audioBuffer, 'fuse_burning.wav');

      expect(res.status).toBe(200);
      expect(res.body.soundEffects?.inGameEffect?.url).toMatch(
        /^\/assets\/sounds\/items\/item_dynamite_1_inGameEffect_sfx\.wav$/
      );
      expect(res.body.soundEffects?.inGameEffect?.loop).toBe(true);
    });

    it('should upload explosion sound and throw sound to their respective slots', async () => {
      const audioBuffer = Buffer.from('RIFF....WAVEfmt ....data....');

      // Upload explosion
      const resExp = await request(app)
        .post('/api/admin/items/item_dynamite_1/sound-effects/explosion')
        .attach('soundEffect', audioBuffer, 'explosion.wav');

      expect(resExp.status).toBe(200);
      expect(resExp.body.soundEffects?.explosion?.url).toMatch(
        /^\/assets\/sounds\/items\/item_dynamite_1_explosion_sfx\.wav$/
      );
      expect(resExp.body.soundEffects?.explosion?.loop).toBe(false);

      // Upload throw
      const resThrow = await request(app)
        .post('/api/admin/items/item_dynamite_1/sound-effects/throw')
        .attach('soundEffect', audioBuffer, 'throw.wav');

      expect(resThrow.status).toBe(200);
      expect(resThrow.body.soundEffects?.throw?.url).toMatch(
        /^\/assets\/sounds\/items\/item_dynamite_1_throw_sfx\.wav$/
      );
      // throw also syncs to soundEffectUrl for backward compatibility
      expect(resThrow.body.soundEffectUrl).toMatch(
        /^\/assets\/sounds\/items\/item_dynamite_1_throw_sfx\.wav$/
      );
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

    it('should remove a specific sound slot', async () => {
      const dynamite = mockItems.find((i) => i.id === 'item_dynamite_1');
      dynamite.soundEffects = {
        explosion: {
          url: '/assets/sounds/items/item_dynamite_1_explosion_sfx.wav',
          loop: false,
        },
      };

      const res = await request(app)
        .delete('/api/admin/items/item_dynamite_1/sound-effects/explosion');

      expect(res.status).toBe(200);
      expect(res.body.soundEffects?.explosion?.url).toBeNull();
    });
  });
});
