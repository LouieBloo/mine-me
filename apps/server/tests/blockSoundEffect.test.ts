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

let mockBlocks: any[] = [];

vi.mock('../src/index', () => ({
  prisma: {
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

  it('should upload a sound effect for a block', async () => {
    const audioBuffer = Buffer.from('RIFF....WAVEfmt ....data....');

    const res = await request(app)
      .post('/api/admin/blocks/block_dirt/sound-effect')
      .attach('soundEffect', audioBuffer, 'dirt_hit.wav');

    expect(res.status).toBe(200);
    expect(res.body.soundEffectUrl).toMatch(/^\/assets\/sounds\/blocks\/block_dirt_sfx\.wav$/);
    expect(mockBlocks[0].soundEffectUrl).toMatch(/^\/assets\/sounds\/blocks\/block_dirt_sfx\.wav$/);
  });

  it('should return 400 when no file is uploaded', async () => {
    const res = await request(app)
      .post('/api/admin/blocks/block_dirt/sound-effect');

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('No sound effect file provided');
  });

  it('should return 404 when block is not found during upload', async () => {
    const audioBuffer = Buffer.from('fake-audio-data');

    const res = await request(app)
      .post('/api/admin/blocks/non_existent_block/sound-effect')
      .attach('soundEffect', audioBuffer, 'stone_hit.mp3');

    expect(res.status).toBe(404);
  });

  it('should remove a sound effect from a block', async () => {
    const res = await request(app)
      .delete('/api/admin/blocks/block_copperium/sound-effect');

    expect(res.status).toBe(200);
    expect(res.body.soundEffectUrl).toBeNull();
    expect(mockBlocks[1].soundEffectUrl).toBeNull();
  });

  it('should return 404 when removing sound effect from non-existent block', async () => {
    const res = await request(app)
      .delete('/api/admin/blocks/non_existent_block/sound-effect');

    expect(res.status).toBe(404);
  });
});
