import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { adminRouter } from '../src/routes/admin';

// Mock auth middleware to bypass auth during tests
vi.mock('../src/middleware/auth', () => ({
  adminMiddleware: (req: any, res: any, next: any) => next(),
  authenticateToken: (req: any, res: any, next: any) => next(),
}));

const app = express();
app.use(express.json());
app.use('/admin', adminRouter);

// Mock fs to prevent actual file writes
vi.mock('fs', () => ({
  default: { writeFileSync: vi.fn() }
}));

// Mock Prisma client operations specifically for CharacterLevel
const { mockPrismaCharacterLevel } = vi.hoisted(() => {
  const mockCharacterLevels = [
    { id: 'level_1', level: 1, xpRequired: 0, dropTable: null },
    { id: 'level_2', level: 2, xpRequired: 100, dropTable: null }
  ];

  const mockPrismaCharacterLevel = {
    findMany: vi.fn().mockResolvedValue(mockCharacterLevels),
    findUnique: vi.fn().mockImplementation(({ where }: any) => {
      if (where.level !== undefined) {
        return Promise.resolve(mockCharacterLevels.find(l => l.level === where.level) || null);
      }
      return Promise.resolve(mockCharacterLevels.find(l => l.id === where.id) || null);
    }),
    findFirst: vi.fn().mockImplementation(({ where }: any) => {
      // check if another level has this level number
      const levelVal = where.level;
      const notId = where.NOT?.id;
      const found = mockCharacterLevels.find(l => l.level === levelVal && l.id !== notId);
      return Promise.resolve(found || null);
    }),
    create: vi.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'new_id', ...data })),
    update: vi.fn().mockImplementation(({ where, data }: any) => Promise.resolve({ id: where.id, ...data })),
    delete: vi.fn().mockImplementation(({ where }: any) => Promise.resolve({ id: where.id, level: 2, xpRequired: 100 }))
  };

  return { mockPrismaCharacterLevel };
});

vi.mock('../src/index', () => ({
  prisma: {
    characterLevel: mockPrismaCharacterLevel,
    city: { findMany: vi.fn() },
    item: { findMany: vi.fn() },
    mob: { findMany: vi.fn() },
    dungeon: { findMany: vi.fn() },
    dungeonLevel: { findMany: vi.fn() },
    inventoryItem: { findMany: vi.fn() },
    user: { findMany: vi.fn() },
  }
}));

describe('CharacterLevel Controller /admin/levels', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('GET /admin/levels - should return all levels', async () => {
    const res = await request(app).get('/admin/levels');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(2);
    expect(res.body[0].level).toBe(1);
    expect(mockPrismaCharacterLevel.findMany).toHaveBeenCalled();
  });

  it('GET /admin/levels/:id - should return single level config', async () => {
    const res = await request(app).get('/admin/levels/level_1');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id', 'level_1');
    expect(res.body).toHaveProperty('level', 1);
  });

  it('POST /admin/levels - should create a new level config', async () => {
    // Mock findUnique to return null so it doesn't fail existing check
    mockPrismaCharacterLevel.findUnique.mockResolvedValueOnce(null);

    const payload = {
      level: 3,
      xpRequired: 400,
      dropTable: {
        solMin: 10,
        solMax: 20,
        experience: 0,
        items: []
      }
    };

    const res = await request(app).post('/admin/levels').send(payload);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id', 'new_id');
    expect(res.body).toHaveProperty('level', 3);
    expect(res.body).toHaveProperty('xpRequired', 400);
    expect(mockPrismaCharacterLevel.create).toHaveBeenCalled();
  });

  it('POST /admin/levels - should return 400 if validation fails', async () => {
    const payload = {
      level: 0, // Invalid: must be >= 1
      xpRequired: -5 // Invalid: must be >= 0
    };

    const res = await request(app).post('/admin/levels').send(payload);
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('errors');
    expect(res.body.errors.length).toBeGreaterThan(0);
  });

  it('POST /admin/levels - should return 400 if level number already exists', async () => {
    // Mock findUnique to return existing level
    mockPrismaCharacterLevel.findUnique.mockResolvedValueOnce({ id: 'level_2', level: 2 });

    const payload = {
      level: 2,
      xpRequired: 200
    };

    const res = await request(app).post('/admin/levels').send(payload);
    expect(res.status).toBe(400);
    expect(res.body.errors[0].msg).toBe('Level already exists');
  });

  it('PUT /admin/levels/:id - should update level config', async () => {
    // Mock findFirst to return null (no duplicate levels)
    mockPrismaCharacterLevel.findFirst.mockResolvedValueOnce(null);

    const payload = {
      level: 2,
      xpRequired: 250
    };

    const res = await request(app).put('/admin/levels/level_2').send(payload);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id', 'level_2');
    expect(res.body).toHaveProperty('xpRequired', 250);
    expect(mockPrismaCharacterLevel.update).toHaveBeenCalled();
  });

  it('DELETE /admin/levels/:id - should delete level config', async () => {
    const res = await request(app).delete('/admin/levels/level_2');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('id', 'level_2');
    expect(mockPrismaCharacterLevel.delete).toHaveBeenCalled();
  });
});
