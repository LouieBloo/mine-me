import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { Prisma } from '@prisma/client';

vi.mock('../src/middleware/auth', () => ({
  adminMiddleware: (_req: any, _res: any, next: any) => next(),
  authenticateToken: (_req: any, _res: any, next: any) => next(),
}));

const { syncJson } = vi.hoisted(() => ({ syncJson: vi.fn() }));
vi.mock('../src/services/admin.service', async () => {
  const actual: any = await vi.importActual('../src/services/admin.service');
  return { ...actual, syncJson };
});
vi.mock('../src/services/mining/definitionReloader', () => ({ reloadDefinitions: vi.fn().mockResolvedValue({ ok: true }) }));
vi.mock('../src/services/miningConfig.service', () => ({ getActiveMiningConfig: vi.fn().mockResolvedValue(undefined) }));

let rows: any[] = [];
// (the database hands a cleared Json column back as null)
const strip = (row: any) => ({ ...row, soundEffects: row.soundEffects === Prisma.JsonNull ? null : row.soundEffects ?? null });

vi.mock('../src/index', () => ({
  prisma: {
    mission: {
      findMany: vi.fn().mockImplementation(() => Promise.resolve([...rows].sort((a, b) => a.key.localeCompare(b.key)).map(strip))),
      findFirst: vi.fn().mockImplementation(({ where }) => {
        const row = rows.find((r) => where.OR.some((c: any) => c.id === r.id || c.key === r.key));
        return Promise.resolve(row ? strip(row) : null);
      }),
      findUnique: vi.fn().mockImplementation(({ where }) => Promise.resolve(rows.find((r) => r.key === where.key) ?? null)),
      create: vi.fn().mockImplementation(({ data }) => {
        const row = { id: `mission_${rows.length + 1}`, ...data };
        rows.push(row);
        return Promise.resolve(row);
      }),
      update: vi.fn().mockImplementation(({ where, data }) => {
        const i = rows.findIndex((r) => r.id === where.id);
        rows[i] = { ...rows[i], ...data };
        return Promise.resolve(strip(rows[i]));
      }),
      delete: vi.fn().mockImplementation(({ where }) => {
        rows = rows.filter((r) => r.id !== where.id);
        return Promise.resolve({});
      }),
    },
    sound: { findUnique: vi.fn().mockImplementation(({ where }) => Promise.resolve(where.id === 's1' ? { id: 's1' } : null)) },
  },
}));

import { adminRouter } from '../src/routes/admin';
import { MiningDataManager } from '../src/services/mining/subsystems/MiningDataManager';

const app = express();
app.use(express.json());
app.use('/admin', adminRouter);

const data = MiningDataManager.getInstance();
const copperItem = data.getItems().find((i) => data.getBlocksDropping(i.id).some((b) => b.typeKey === 'COPPERIUM'))!;
const mob = data.getMobs()[0];
const water = data.getFluids().find((f) => f.typeKey === 'WATER')!;
const gas = data.getGases()[0];

const GOOD = {
  key: 'copper_run', name: 'Copper Run', description: 'Dig for copper.', minLevel: 1, maxLevel: 5, tier: 1, weight: 2,
  objectives: [{ type: 'MINE_ITEM', targetId: copperItem.id, amount: 10 }], rewardCoins: 20, rewardXp: 10,
  rewardItems: [{ itemId: copperItem.id, chance: 50, minQuantity: 1, maxQuantity: 2 }],
};

describe('admin missions', () => {
  beforeEach(() => {
    rows = [];
    syncJson.mockClear();
  });

  it('creates a mission, stores its objectives and reward, and mirrors the table to the dev seed', async () => {
    const res = await request(app).post('/admin/missions').send(GOOD);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ key: 'copper_run', tier: 1, weight: 2, rewardCoins: 20, objectives: GOOD.objectives, rewardItems: GOOD.rewardItems });
    expect(syncJson).toHaveBeenCalledWith('missions.json', expect.any(Array));
    expect((await request(app).get('/admin/missions')).body).toHaveLength(1);
    expect((await request(app).get('/admin/missions/copper_run')).body.name).toBe('Copper Run');
  });

  it('rejects an empty objective list, an unknown target, a zero amount and levels the wrong way round', async () => {
    const cases: Array<[object, RegExp]> = [
      [{ objectives: [] }, /at least one objective/],
      [{ objectives: [{ type: 'MINE_ITEM', targetId: 'nope', amount: 3 }] }, /unknown item/],
      [{ objectives: [{ type: 'KILL_MOB', amount: 0 }] }, /amount/],
      [{ minLevel: 9, maxLevel: 2 }, /minimum level/],
      [{ objectives: [{ type: 'PUMP_FLUID', targetId: water.id, amount: 5 }] }, /cannot be used yet/],
      [{ objectives: [{ type: 'REACH_DEPTH', amount: 100000 }] }, /deep/],
      [{ key: 'Bad Key' }, /key must be/],
    ];
    for (const [patch, message] of cases) {
      const res = await request(app).post('/admin/missions').send({ ...GOOD, ...patch });
      expect(res.status, JSON.stringify(patch)).toBe(400);
      expect(res.body.error).toMatch(message);
    }
    expect(rows).toHaveLength(0);
  });

  it('refuses a second mission with the same key', async () => {
    await request(app).post('/admin/missions').send(GOOD);
    expect((await request(app).post('/admin/missions').send(GOOD)).status).toBe(409);
  });

  it('accepts one objective of every kind in a mission', async () => {
    const objectives = [
      { type: 'MINE_ITEM', targetId: copperItem.id, amount: 5 },
      { type: 'KILL_MOB', targetId: mob.id, amount: 2 },
      { type: 'KILL_MOB', amount: 4 },
      { type: 'CLEAR_FLUID', targetId: water.id, amount: 80 },
      { type: 'CLEAR_GAS', targetId: gas.id, amount: 60 },
    ];
    const res = await request(app).post('/admin/missions').send({ ...GOOD, objectives });
    expect(res.status).toBe(201);
    expect((await request(app).post('/admin/missions').send({ ...GOOD, key: 'deep', objectives: [{ type: 'REACH_DEPTH', amount: 60 }] })).status).toBe(201);
  });

  it('updates fields, keeps the key, and rechecks the whole mission', async () => {
    await request(app).post('/admin/missions').send(GOOD);
    const ok = await request(app).patch('/admin/missions/copper_run').send({ tier: 3, rewardCoins: '75', key: 'ignored' });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ key: 'copper_run', tier: 3, rewardCoins: 75 });
    const bad = await request(app).patch('/admin/missions/copper_run').send({ minLevel: 50 });
    expect(bad.status).toBe(400);
    expect(rows[0].minLevel).toBe(1);
  });

  it('deletes a mission and answers 404 for one that is not there', async () => {
    await request(app).post('/admin/missions').send(GOOD);
    expect((await request(app).delete('/admin/missions/copper_run')).body).toEqual({ success: true });
    expect(rows).toHaveLength(0);
    expect((await request(app).delete('/admin/missions/copper_run')).status).toBe(404);
    expect((await request(app).get('/admin/missions/copper_run')).status).toBe(404);
  });

  it('checks a draft without saving it: problems, the written objectives and what the map will hold', async () => {
    const res = await request(app).post('/admin/missions/preview').send({ objectives: [{ type: 'MINE_ITEM', targetId: copperItem.id, amount: 10 }, { type: 'CLEAR_GAS', targetId: gas.id, amount: 50 }, { type: 'KILL_MOB', amount: 3 }, { type: 'REACH_DEPTH', amount: 40 }] });
    expect(res.status).toBe(200);
    expect(res.body.labels).toContain('Reach depth 40');
    expect(res.body.requirements.minDepth).toBe(40);
    expect(res.body.lines.join(' ')).toMatch(/Copperium Ore blocks/);
    expect(res.body.lines.join(' ')).toMatch(/pocket of/);
    expect(res.body.lines.join(' ')).toMatch(/mobs of any kind/);
    expect(rows).toHaveLength(0);
    const bad = await request(app).post('/admin/missions/preview').send({ objectives: [{ type: 'MINE_ITEM', targetId: 'nope', amount: 1 }] });
    expect(bad.body.errors.join()).toMatch(/unknown item/);
  });

  it('simulates which missions a level would be offered and how often', async () => {
    for (let i = 0; i < 6; i++) await request(app).post('/admin/missions').send({ ...GOOD, key: `m${i}`, minLevel: 1, maxLevel: 3 });
    await request(app).post('/admin/missions').send({ ...GOOD, key: 'high', minLevel: 8, maxLevel: 9 });
    const res = await request(app).post('/admin/missions/simulate-offers').send({ level: 2, rolls: 500 });
    expect(res.status).toBe(200);
    const high = res.body.missions.find((m: any) => m.key === 'high');
    expect(high).toMatchObject({ eligible: false, share: 0 });
    expect(res.body.missions.filter((m: any) => m.eligible).every((m: any) => m.share > 0)).toBe(true);
    expect((await request(app).post('/admin/missions/simulate-offers').send({ level: 0 })).status).toBe(400);
  });

  it('sets a sound slot from the library, keeps its volume, and rejects unknown slots and sounds', async () => {
    await request(app).post('/admin/missions').send(GOOD);
    const set = await request(app).patch('/admin/missions/copper_run/sound-effects/complete').send({ soundId: 's1', volume: 0.5 });
    expect(set.status).toBe(200);
    expect(set.body.soundEffects).toEqual({ complete: { soundId: 's1', volume: 0.5 } });
    expect((await request(app).patch('/admin/missions/copper_run/sound-effects/ambient').send({ soundId: 's1' })).status).toBe(400);
    expect((await request(app).patch('/admin/missions/copper_run/sound-effects/complete').send({ soundId: 'nope' })).status).toBe(404);
    const cleared = await request(app).patch('/admin/missions/copper_run/sound-effects/complete').send({ soundId: null });
    expect(cleared.body.soundEffects ?? null).toBeNull();
  });
});
