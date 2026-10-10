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

let mockBlocks: any[] = [];

vi.mock('../src/index', () => ({
  prisma: {
    sound: {
      findUnique: vi.fn().mockImplementation(({ where }) =>
        Promise.resolve(where.id === 'lib_1' ? { id: 'lib_1', name: 'Crunch', url: '/assets/sounds/Crunch.mp3' } : null)
      ),
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
    miningBlock: {
      findFirst: vi.fn().mockImplementation(({ where }) => {
        const found = mockBlocks.find(b =>
          b.id === where?.id ||
          b.typeKey === where?.typeKey ||
          (where?.OR && where.OR.some((cond: any) => b.id === cond.id || b.typeKey === cond.typeKey))
        );
        return Promise.resolve(found ? { ...found } : null);
      }),
      update: vi.fn().mockImplementation(({ where, data }) => {
        const idx = mockBlocks.findIndex(b => b.id === where.id);
        if (idx !== -1) {
          mockBlocks[idx] = { ...mockBlocks[idx], ...data, updatedAt: new Date().toISOString() };
          return Promise.resolve({
            ...mockBlocks[idx],
            idleParticleEffect: null,
            dropTable: null,
          });
        }
        return Promise.reject(new Error('Block not found'));
      }),
      findMany: vi.fn().mockImplementation(() => Promise.resolve([...mockBlocks])),
    },
  },
}));

const app = express();
app.use(express.json());
app.use('/api/admin', adminRouter);

describe('Mining Block Sound Effect Endpoints', () => {
  beforeEach(() => {
    mockBlocks = [
      {
        id: 'block_dirt',
        typeKey: 'DIRT',
        name: 'Dirt Block',
        description: 'Standard mineable dirt',
        textureUrl: '/assets/mining/dirt-block.jpg',
        soundEffectUrl: null,
        mineTimeMs: 500,
        staminaCost: 1,
      },
      {
        id: 'block_copperium',
        typeKey: 'COPPERIUM',
        name: 'Copperium Ore',
        description: 'Copper deposit',
        textureUrl: '/assets/mining/copperium-block.png',
        soundEffectUrl: '/assets/sounds/blocks/copperium_sfx.wav',
        mineTimeMs: 1200,
        staminaCost: 1,
      },
    ];
  });

  it('points the block at a library sound', async () => {
    const res = await request(app).patch('/api/admin/blocks/block_dirt/sound-effect').send({ soundId: 'lib_1' });

    expect(res.status).toBe(200);
    expect(res.body.soundEffectUrl).toBe('/assets/sounds/Crunch.mp3');
    expect(mockBlocks[0].soundEffectUrl).toBe('/assets/sounds/Crunch.mp3');
  });

  it('finds the block by its type key too', async () => {
    const res = await request(app).patch('/api/admin/blocks/dirt/sound-effect').send({ soundId: 'lib_1' });
    expect(res.status).toBe(200);
  });

  it('clears the sound without touching the file or the library', async () => {
    (prisma as any).sound.deleteMany.mockClear();
    const res = await request(app).patch('/api/admin/blocks/block_copperium/sound-effect').send({ soundId: null });

    expect(res.status).toBe(200);
    expect(res.body.soundEffectUrl).toBeNull();
    expect((prisma as any).sound.deleteMany).not.toHaveBeenCalled();
  });

  it('rejects an unknown sound, a malformed id and an unknown block', async () => {
    expect((await request(app).patch('/api/admin/blocks/block_dirt/sound-effect').send({ soundId: 'nope' })).status).toBe(404);
    expect((await request(app).patch('/api/admin/blocks/block_dirt/sound-effect').send({ soundId: 7 })).status).toBe(400);
    expect((await request(app).patch('/api/admin/blocks/ghost/sound-effect').send({ soundId: 'lib_1' })).status).toBe(404);
  });

  it('has no upload or remove endpoint of its own any more (sounds are uploaded to the library)', async () => {
    const upload = await request(app).post('/api/admin/blocks/block_dirt/sound-effect').attach('soundEffect', Buffer.from('x'), 'a.mp3');
    const remove = await request(app).delete('/api/admin/blocks/block_copperium/sound-effect');
    expect(upload.status).toBe(404);
    expect(remove.status).toBe(404);
    expect(mockBlocks[1].soundEffectUrl).toBe('/assets/sounds/blocks/copperium_sfx.wav');
  });
});
