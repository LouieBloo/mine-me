import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import { authRouter } from '../src/routes/auth';

const app = express();
app.use(express.json());
app.use('/auth', authRouter);

// Mocking the Prisma Client for the test suite,
// to avoid inserting data into a live development database.
vi.mock('../src/index', () => ({
  prisma: {
    user: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({
        id: 'test_id',
        phoneNumber: '1234567890',
        familyName: 'TestFamily',
      }),
      findUnique: vi.fn().mockImplementation(({ where }) => {
        if (where.phoneNumber === '1234567890') {
           return { id: 'test_id', phoneNumber: '1234567890' }
        }
        return null;
      }),
    }
  }
}));

describe('Auth API Routes', () => {

  it('should successfully sign up a new user', async () => {
    const res = await request(app)
      .post('/auth/signup')
      .send({ phoneNumber: '1234567890', familyName: 'TestFamily' });
    
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user.phoneNumber).toBe('1234567890');
  });

  it('should reject signup without required fields', async () => {
    const res = await request(app)
      .post('/auth/signup')
      .send({ familyName: 'NoPhone' });
    
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('should login an existing user', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ phoneNumber: '1234567890' });
    
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
  });

  it('should fail login for unknown user', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ phoneNumber: '0000000000' });
    
    expect(res.status).toBe(404);
  });
});
