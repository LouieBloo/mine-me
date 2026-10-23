import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

vi.mock('../src/middleware/auth', () => ({
  adminMiddleware: (_req: any, _res: any, next: any) => next(),
  authenticateToken: (_req: any, _res: any, next: any) => next(),
}));
const { syncJson } = vi.hoisted(() => ({ syncJson: vi.fn() }));
vi.mock('../src/services/admin.service', async () => ({ ...(await vi.importActual<any>('../src/services/admin.service')), syncJson }));

let items: any[] = [];
vi.mock('../src/index', () => ({
  prisma: {
    item: {
      findUnique: vi.fn().mockImplementation(({ where }) => Promise.resolve(items.find((i) => i.id === where.id) ?? null)),
      findMany: vi.fn().mockImplementation(() => Promise.resolve(items)),
      update: vi.fn().mockImplementation(({ where, data }) => {
        const i = items.findIndex((x) => x.id === where.id);
        items[i] = { ...items[i], ...data };
        return Promise.resolve(items[i]);
      }),
    },
  },
}));

import { adminRouter } from '../src/routes/admin';

const app = express();
app.use(express.json());
app.use('/admin', adminRouter);
const patch = (body: object, id = 'i1') => request(app).patch(`/admin/items/${id}/weight`).send(body);

describe('admin item weight', () => {
  beforeEach(() => {
    items = [{ id: 'i1', name: 'Copperium', weight: 0, itemEffects: [{ effectId: 'e' }] }];
    syncJson.mockClear();
  });

  it('sets the weight, touches nothing else, and mirrors the items', async () => {
    const res = await patch({ weight: 2.5 });
    expect(res.status).toBe(200);
    expect(items[0].weight).toBe(2.5);
    expect(items[0].itemEffects).toHaveLength(1);
    expect(syncJson).toHaveBeenCalledWith('items.json', expect.any(Array));
  });

  it('accepts 0 and rejects negative, missing and non-number weights', async () => {
    expect((await patch({ weight: 0 })).status).toBe(200);
    for (const body of [{ weight: -1 }, {}, { weight: 'heavy' }, { weight: Number.NaN }]) expect((await patch(body)).status).toBe(400);
    expect(items[0].weight).toBe(0);
  });

  it('404s for a missing item', async () => {
    expect((await patch({ weight: 1 }, 'ghost')).status).toBe(404);
  });
});
