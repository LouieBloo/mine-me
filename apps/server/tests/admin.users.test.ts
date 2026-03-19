import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { adminRouter } from '../src/routes/admin';

const app = express();
app.use(express.json());
app.use('/admin', adminRouter);

vi.mock('../src/index', () => ({
  prisma: {
    user: {
      findMany: vi.fn().mockResolvedValue([
        { id: 'user_1', phoneNumber: '111', familyName: 'Fam1', createdAt: new Date() }
      ]),
      findUnique: vi.fn().mockResolvedValue(
        { id: 'user_1', phoneNumber: '111', familyName: 'Fam1', createdAt: new Date() }
      ),
      create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'user_new', ...data })),
      update: vi.fn().mockImplementation(({ where, data }) => Promise.resolve({ ...where, ...data }))
    }
  }
}));

describe('Admin Users API Routes', () => {
  it('should fetch all users', async () => {
    const res = await request(app).get('/admin/users');
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].id).toBe('user_1');
  });

  it('should fetch a single user', async () => {
    const res = await request(app).get('/admin/users/user_1');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('user_1');
  });

  it('should create a new user', async () => {
    const res = await request(app)
      .post('/admin/users')
      .send({ phoneNumber: '222', familyName: 'Fam2' });
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('user_new');
    expect(res.body.phoneNumber).toBe('222');
  });

  it('should update a user', async () => {
    const res = await request(app)
      .put('/admin/users/user_1')
      .send({ familyName: 'Fam3' });
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('user_1');
    expect(res.body.familyName).toBe('Fam3');
  });
});
