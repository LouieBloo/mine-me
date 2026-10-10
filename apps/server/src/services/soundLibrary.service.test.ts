import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  categoryForUrl,
  registerSoundFile,
  syncSoundLibrary,
  tryRegisterSoundFile,
  unregisterSoundFile,
} from './soundLibrary.service';

const fakeDb = (rows: any[] = []) => {
  const db: any = {
    sound: {
      findFirst: vi.fn(async ({ where }: any) => rows.find((r) => r.url === where.url) ?? null),
      findMany: vi.fn(async () => rows.map((r) => ({ ...r }))),
      create: vi.fn(async ({ data }: any) => {
        const row = { id: `id${rows.length + 1}`, ...data };
        rows.push(row);
        return row;
      }),
      update: vi.fn(async ({ where, data }: any) => Object.assign(rows.find((r) => r.id === where.id), data)),
      deleteMany: vi.fn(async ({ where }: any) => {
        for (let i = rows.length - 1; i >= 0; i--) if (rows[i].url === where.url) rows.splice(i, 1);
        return { count: 1 };
      }),
    },
  };
  return { db, rows };
};

describe('categoryForUrl', () => {
  it.each([
    ['/assets/sounds/items/a.mp3', 'ITEM'],
    ['/assets/sounds/blocks/a.mp3', 'BLOCK'],
    ['/assets/sounds/mobs/mole/a.mp3', 'MOB'],
    ['/assets/sounds/a.mp3', 'GENERAL'],
    ['/assets/sounds/other/a.mp3', 'GENERAL'],
  ])('%s -> %s', (url, expected) => expect(categoryForUrl(url)).toBe(expected));
});

describe('registerSoundFile / unregisterSoundFile', () => {
  it('creates a sound-effect row with a readable name', async () => {
    const { db, rows } = fakeDb();
    await registerSoundFile(db, { url: '/assets/sounds/items/revolver_shot.wav', fileName: 'revolver_shot.wav', fileSize: 10, category: 'ITEM' });
    expect(rows[0]).toMatchObject({ name: 'revolver shot', type: 'SFX', category: 'ITEM', mimeType: 'audio/wav', loop: false });
  });

  it('updates the existing row for the same url instead of duplicating', async () => {
    const { db, rows } = fakeDb();
    const file = { url: '/assets/sounds/items/a.mp3', fileName: 'a.mp3', fileSize: 1, category: 'ITEM' as const };
    await registerSoundFile(db, file);
    await registerSoundFile(db, { ...file, fileSize: 99 });
    expect(rows).toHaveLength(1);
    expect(rows[0].fileSize).toBe(99);
  });

  it('removes the row by url', async () => {
    const { db, rows } = fakeDb([{ id: '1', url: '/assets/sounds/a.mp3' }]);
    await unregisterSoundFile(db, '/assets/sounds/a.mp3');
    expect(rows).toHaveLength(0);
  });

  it('tryRegister swallows database errors', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { db } = fakeDb();
    db.sound.findFirst.mockRejectedValue(new Error('down'));
    await expect(tryRegisterSoundFile(db, { url: '/x.mp3', fileName: 'x.mp3', fileSize: 1, category: 'GENERAL' })).resolves.toBeUndefined();
  });
});

describe('syncSoundLibrary', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sound-sync-'));
    fs.mkdirSync(path.join(dir, 'items'));
    fs.mkdirSync(path.join(dir, 'mobs/mole'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'known.mp3'), 'x');
    fs.writeFileSync(path.join(dir, 'items/shot.wav'), 'xx');
    fs.writeFileSync(path.join(dir, 'mobs/mole/dig.mp3'), 'xxx');
    fs.writeFileSync(path.join(dir, 'notes.txt'), 'not audio');
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('registers unregistered audio files by folder category and ignores other files', async () => {
    const { db, rows } = fakeDb([{ id: 'k', name: 'known', url: '/assets/sounds/known.mp3' }]);
    const report = await syncSoundLibrary(db, dir);
    expect(report.added.map((a) => [a.url, a.category]).sort()).toEqual([
      ['/assets/sounds/items/shot.wav', 'ITEM'],
      ['/assets/sounds/mobs/mole/dig.mp3', 'MOB'],
    ]);
    expect(rows).toHaveLength(3);
    expect(rows.find((r) => r.url.endsWith('shot.wav'))).toMatchObject({ fileSize: 2, category: 'ITEM' });
  });

  it('dry run reports without writing', async () => {
    const { db, rows } = fakeDb();
    const report = await syncSoundLibrary(db, dir, { dryRun: true });
    expect(report.added).toHaveLength(3);
    expect(rows).toHaveLength(0);
  });

  it('reports rows whose file is gone without deleting them', async () => {
    const { db, rows } = fakeDb([{ id: 'g', name: 'ghost', url: '/assets/sounds/ghost.mp3' }]);
    const report = await syncSoundLibrary(db, dir);
    expect(report.missing).toEqual([{ id: 'g', name: 'ghost', url: '/assets/sounds/ghost.mp3' }]);
    expect(rows.some((r) => r.id === 'g')).toBe(true);
  });

  it('is idempotent', async () => {
    const { db, rows } = fakeDb();
    await syncSoundLibrary(db, dir);
    const second = await syncSoundLibrary(db, dir);
    expect(second.added).toHaveLength(0);
    expect(rows).toHaveLength(3);
  });

  it('handles a missing folder', async () => {
    const { db } = fakeDb();
    expect(await syncSoundLibrary(db, path.join(dir, 'nope'))).toEqual({ added: [], missing: [] });
  });
});
