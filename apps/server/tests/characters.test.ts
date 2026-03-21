import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { charactersRouter } from '../src/routes/characters';

// Mock auth middleware to set req.userId
vi.mock('../src/middleware/auth', () => ({
  authenticateToken: (req: any, res: any, next: any) => {
    req.userId = 'test_user_id';
    next();
  }
}));

const mockFindFirst = vi.fn();
const mockCreate = vi.fn();

vi.mock('../src/index', () => ({
  prisma: {
    character: {
      findMany: vi.fn().mockResolvedValue([
        { id: 'char_1', name: 'Gimli', class: 'Warrior', userId: 'test_user_id' }
      ]),
      findFirst: (...args: any) => mockFindFirst(...args),
      create: (...args: any) => mockCreate(...args),
    },
    city: {
      findFirst: vi.fn().mockResolvedValue({ id: 'city_start' })
    }
  }
}));

const app = express();
app.use(express.json());
app.use('/characters', charactersRouter);

describe('Characters API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('GET / - should return all characters for user', async () => {
    const res = await request(app).get('/characters');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe('Gimli');
  });

  it('POST / - should create a new character if one does not exist', async () => {
    mockFindFirst.mockResolvedValue(null);
    mockCreate.mockImplementation(({ data }) => Promise.resolve({ id: 'new_char_id', ...data }));

    const res = await request(app)
      .post('/characters')
      .send({ name: 'Legolas', class: 'Rogue' });
      
    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Legolas');
    expect(res.body.class).toBe('Rogue');
  });

  it('POST / - should fail if active character exists', async () => {
    mockFindFirst.mockResolvedValue({ id: 'char_1', status: 'ACTIVE' });

    const res = await request(app)
      .post('/characters')
      .send({ name: 'Legolas', class: 'Rogue' });
      
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('already have an active character');
  });
  
  it('POST / - should fail if validation missing', async () => {
    const res = await request(app).post('/characters').send({ name: 'Legolas' }); // missing class
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Name and class are required.');
  });
});
