import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { adminRouter } from '../src/routes/admin';
import { publicRouter } from '../src/routes/public';
import fs from 'fs';
import path from 'path';
import { getSoundsDir } from '../src/config/assetPaths';

// Mock syncJson
export const mockSyncJson = vi.fn();
vi.mock('../src/services/admin.service', () => ({
  syncJson: (...args: any[]) => mockSyncJson(...args),
}));

// Mock auth middleware
vi.mock('../src/middleware/auth', () => ({
  adminMiddleware: (req: any, res: any, next: any) => next(),
  authenticateToken: (req: any, res: any, next: any) => next(),
}));

let mockSounds: any[] = [];
let mockMobs: any[] = [];

vi.mock('../src/index', () => ({
  prisma: {
    mob: { findMany: vi.fn().mockImplementation(() => Promise.resolve(mockMobs)) },
    item: { findMany: vi.fn().mockResolvedValue([]) },
    miningBlock: { findMany: vi.fn().mockResolvedValue([]) },
    sound: {
      findMany: vi.fn().mockImplementation(({ where } = {}) => {
        let results = [...mockSounds];
        if (where?.type) {
          results = results.filter(s => s.type === where.type);
        }
        if (where?.isActive !== undefined) {
          results = results.filter(s => s.isActive === where.isActive);
        }
        return Promise.resolve(results);
      }),
      findFirst: vi.fn().mockImplementation(({ where }) => Promise.resolve(mockSounds.find(s => s.url === where.url) || null)),
      findUnique: vi.fn().mockImplementation(({ where }) => {
        const found = mockSounds.find(s => s.id === where.id);
        return Promise.resolve(found || null);
      }),
      create: vi.fn().mockImplementation(({ data }) => {
        const created = {
          id: `sound_${Date.now()}`,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          ...data
        };
        mockSounds.push(created);
        return Promise.resolve(created);
      }),
      update: vi.fn().mockImplementation(({ where, data }) => {
        const idx = mockSounds.findIndex(s => s.id === where.id);
        if (idx !== -1) {
          mockSounds[idx] = { ...mockSounds[idx], ...data, updatedAt: new Date().toISOString() };
          return Promise.resolve(mockSounds[idx]);
        }
        return Promise.reject(new Error('Sound not found'));
      }),
      delete: vi.fn().mockImplementation(({ where }) => {
        const idx = mockSounds.findIndex(s => s.id === where.id);
        if (idx !== -1) {
          const removed = mockSounds.splice(idx, 1)[0];
          return Promise.resolve(removed);
        }
        return Promise.reject(new Error('Sound not found'));
      }),
    },
  },
}));

const app = express();
app.use(express.json());
app.use('/admin', adminRouter);
app.use('/api/public', publicRouter);

describe('Sound Admin & Public API', () => {
  beforeEach(() => {
    mockMobs = [];
    mockSounds = [
      {
        id: 'sound_1',
        name: 'Cave Theme',
        description: 'Atmospheric cave music',
        type: 'BGM',
        url: '/assets/sounds/cave-theme.mp3',
        fileName: 'cave-theme.mp3',
        fileSize: 1024000,
        mimeType: 'audio/mpeg',
        volume: 0.7,
        loop: true,
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'sound_2',
        name: 'Pickaxe Hit',
        description: 'Mining swing impact',
        type: 'SFX',
        url: '/assets/sounds/hit.mp3',
        fileName: 'hit.mp3',
        fileSize: 45000,
        mimeType: 'audio/mpeg',
        volume: 0.9,
        loop: false,
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'sound_3',
        name: 'Disabled Track',
        description: 'Inactive BGM',
        type: 'BGM',
        url: '/assets/sounds/inactive.mp3',
        fileName: 'inactive.mp3',
        fileSize: 500000,
        mimeType: 'audio/mpeg',
        volume: 0.5,
        loop: true,
        isActive: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];
  });

  it('GET /admin/sounds - returns all sounds', async () => {
    const res = await request(app).get('/admin/sounds');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(3);
  });

  it('GET /admin/sounds?type=BGM - returns only BGM sounds', async () => {
    const res = await request(app).get('/admin/sounds?type=BGM');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body.every((s: any) => s.type === 'BGM')).toBe(true);
  });

  it('GET /admin/sounds/:id - returns specific sound', async () => {
    const res = await request(app).get('/admin/sounds/sound_1');
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Cave Theme');
  });

  it('GET /admin/sounds/:id - returns 404 if not found', async () => {
    const res = await request(app).get('/admin/sounds/non_existent');
    expect(res.status).toBe(404);
  });

  it('POST /admin/sounds - uploads sound file successfully', async () => {
    // Create temporary dummy mp3 file buffer
    const dummyBuffer = Buffer.from('ID3dummy-audio-content');

    const res = await request(app)
      .post('/admin/sounds')
      .field('name', 'Mine Depths')
      .field('type', 'BGM')
      .field('volume', '0.8')
      .field('loop', 'true')
      .attach('file', dummyBuffer, 'mine_depths.mp3');

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Mine Depths');
    expect(res.body.type).toBe('BGM');
    expect(res.body.volume).toBe(0.8);
    expect(res.body.url).toContain('/assets/sounds/');
    expect(mockSyncJson).toHaveBeenCalledWith('sounds.json', expect.any(Array));
  });

  describe('uploaded sounds keep their own name', () => {
    it('names the sound and its file after the uploaded file, whatever it is for', async () => {
      const res = await request(app)
        .post('/admin/sounds')
        .field('category', 'ITEM')
        .field('type', 'SFX')
        .attach('file', Buffer.from('ID3a'), 'Big Boom (final).mp3');

      expect(res.status).toBe(201);
      expect(res.body.name).toBe('Big Boom (final)');
      expect(res.body.fileName).toBe('Big_Boom_final.mp3');
      expect(res.body.url).toBe('/assets/sounds/Big_Boom_final.mp3');
      expect(res.body.category).toBe('ITEM');
      expect(fs.existsSync(getSoundsDir('Big_Boom_final.mp3'))).toBe(true);
    });

    it('never overwrites an existing file: a second upload with the same name gets -2', async () => {
      const first = await request(app).post('/admin/sounds').attach('file', Buffer.from('FIRST'), 'click.mp3');
      const second = await request(app).post('/admin/sounds').attach('file', Buffer.from('SECOND'), 'click.mp3');

      expect(first.body.fileName).toBe('click.mp3');
      expect(second.body.fileName).toBe('click-2.mp3');
      expect(second.body.name).toBe('click');
      expect(fs.readFileSync(getSoundsDir('click.mp3'), 'utf-8')).toBe('FIRST');
      expect(fs.readFileSync(getSoundsDir('click-2.mp3'), 'utf-8')).toBe('SECOND');
    });

    it('lets an explicit name override the file name', async () => {
      const res = await request(app).post('/admin/sounds').field('name', 'Pistol Shot').attach('file', Buffer.from('x'), 'a1.wav');
      expect(res.body.name).toBe('Pistol Shot');
      expect(res.body.fileName).toBe('a1.wav');
    });
  });

  it('PUT /admin/sounds/:id - updates sound properties', async () => {
    mockSyncJson.mockClear();
    const res = await request(app)
      .put('/admin/sounds/sound_1')
      .send({
        name: 'Cave Theme Remastered',
        volume: 0.65,
        isActive: false,
      });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Cave Theme Remastered');
    expect(res.body.volume).toBe(0.65);
    expect(res.body.isActive).toBe(false);
    expect(mockSyncJson).toHaveBeenCalledWith('sounds.json', expect.any(Array));
  });

  it('DELETE /admin/sounds/:id - refuses while a mob slot uses the sound', async () => {
    mockMobs = [{ name: 'Mole', soundEffects: { death: { soundId: 'sound_2' } } }];
    const res = await request(app).delete('/admin/sounds/sound_2');
    expect(res.status).toBe(409);
    expect(res.body.usedBy).toEqual(['Mob: Mole (death)']);
    expect(mockSounds.find(s => s.id === 'sound_2')).toBeDefined();
  });

  it('GET /admin/sounds - reports what uses each sound', async () => {
    mockMobs = [{ name: 'Mole', soundEffects: { idle: { soundId: 'sound_1' } } }];
    const res = await request(app).get('/admin/sounds');
    expect(res.body.find((s: any) => s.id === 'sound_1').usedBy).toEqual(['Mob: Mole (idle)']);
    expect(res.body.find((s: any) => s.id === 'sound_2').usedBy).toEqual([]);
  });

  it('POST /admin/sounds/sync - registers files found in the sounds folder', async () => {
    fs.mkdirSync(getSoundsDir('mobs'), { recursive: true });
    fs.writeFileSync(getSoundsDir('mobs', 'growl.mp3'), 'x');
    const res = await request(app).post('/admin/sounds/sync');
    expect(res.status).toBe(200);
    expect(res.body.added).toContainEqual({ url: '/assets/sounds/mobs/growl.mp3', category: 'MOB' });
    expect(mockSounds.some(s => s.url === '/assets/sounds/mobs/growl.mp3' && s.category === 'MOB')).toBe(true);
  });

  it('DELETE /admin/sounds/:id - deletes sound', async () => {
    mockSyncJson.mockClear();
    const res = await request(app).delete('/admin/sounds/sound_2');
    expect(res.status).toBe(200);
    expect(mockSounds.find(s => s.id === 'sound_2')).toBeUndefined();
    expect(mockSyncJson).toHaveBeenCalledWith('sounds.json', expect.any(Array));
  });

  it('GET /api/public/sounds/bgm - returns only active BGM tracks', async () => {
    const res = await request(app).get('/api/public/sounds/bgm');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe('sound_1');
    expect(res.body[0].isActive).toBe(true);
    expect(res.body[0].type).toBe('BGM');
  });
});
