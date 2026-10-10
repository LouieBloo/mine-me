import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { adminRouter } from '../src/routes/admin';
import { getSharedRoot, getSoundsDir, resolveAssetUrl } from '../src/config/assetPaths';

vi.mock('../src/middleware/auth', () => ({
  adminMiddleware: (req: any, res: any, next: any) => next(),
  authenticateToken: (req: any, res: any, next: any) => next(),
}));
vi.mock('../src/services/admin.service', () => ({ syncJson: vi.fn() }));
vi.mock('../src/index', () => ({
  prisma: {
    sound: {
      create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 's1', ...data })),
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));

const REAL_SOUNDS = path.resolve(__dirname, '../../../packages/shared/assets/sounds');

const listRecursive = (dir: string): string[] =>
  !fs.existsSync(dir)
    ? []
    : fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? listRecursive(path.join(dir, e.name)) : [path.join(dir, e.name)]
      );

describe('test asset isolation', () => {
  it('points asset paths at a temp folder, not the real shared package', () => {
    expect(getSharedRoot().startsWith(os.tmpdir())).toBe(true);
    expect(getSoundsDir('items')).toBe(path.join(getSharedRoot(), 'assets', 'sounds', 'items'));
    expect(resolveAssetUrl('/assets/sounds/a.mp3')).toBe(path.join(getSharedRoot(), 'assets/sounds/a.mp3'));
  });

  it('uploading a sound in a test leaves packages/shared/assets untouched', async () => {
    const app = express();
    app.use(express.json());
    app.use('/admin', adminRouter);
    const before = listRecursive(REAL_SOUNDS).sort();

    const res = await request(app)
      .post('/admin/sounds')
      .field('name', 'Isolation')
      .attach('file', Buffer.from('ID3x'), 'isolation_probe.mp3');

    expect(res.status).toBe(201);
    expect(fs.existsSync(path.join(getSoundsDir(), res.body.fileName))).toBe(true);
    expect(listRecursive(REAL_SOUNDS).sort()).toEqual(before);
  });
});
