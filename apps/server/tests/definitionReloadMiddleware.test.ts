import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

const { reload } = vi.hoisted(() => ({ reload: vi.fn() }));
vi.mock('../src/services/mining/definitionReloader', () => ({ reloadDefinitions: reload }));

import { DEFINITIONS_RELOAD_FAILED_HEADER as RELOAD_FAILED_HEADER } from '@mine-me/shared';
import { affectsDefinitions, reloadDefinitionsAfterWrite } from '../src/middleware/definitionReload';

const order: string[] = [];
const app = express();
app.use(express.json());
app.use(reloadDefinitionsAfterWrite);
app.get('/items', (_req, res) => { order.push('handler'); res.json({ ok: true }); });
app.post('/items', (_req, res) => { order.push('handler'); res.status(201).json({ id: 'new' }); });
app.put('/sounds/:id', (_req, res) => { order.push('handler'); res.json({ saved: true }); });
app.delete('/mobs/:id', (_req, res) => { order.push('handler'); res.status(404).json({ error: 'nope' }); });
app.post('/users', (_req, res) => { order.push('handler'); res.json({ ok: true }); });

describe('affectsDefinitions', () => {
  it('is true only for writes to game content', () => {
    expect(affectsDefinitions('POST', '/items')).toBe(true);
    expect(affectsDefinitions('PATCH', '/mobs/abc/sound-effects/death')).toBe(true);
    expect(affectsDefinitions('DELETE', '/particle-effects/1')).toBe(true);
    expect(affectsDefinitions('GET', '/items')).toBe(false);
    expect(affectsDefinitions('POST', '/users')).toBe(false);
    expect(affectsDefinitions('POST', '/items-other')).toBe(false);
  });
});

describe('reloadDefinitionsAfterWrite', () => {
  beforeEach(() => {
    order.length = 0;
    reload.mockReset();
    reload.mockImplementation(async () => { order.push('reload'); return { ok: true }; });
  });

  it('reloads after a successful content write, before the response is sent', async () => {
    const res = await request(app).post('/items').send({});
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: 'new' });
    expect(order).toEqual(['handler', 'reload']);
    expect(res.headers[RELOAD_FAILED_HEADER.toLowerCase()]).toBeUndefined();
  });

  it('does not reload for reads, unrelated writes, or failed writes', async () => {
    await request(app).get('/items');
    await request(app).post('/users').send({});
    const failed = await request(app).delete('/mobs/x');
    expect(failed.status).toBe(404);
    expect(reload).not.toHaveBeenCalled();
  });

  it('keeps the save response intact but flags it when the reload fails', async () => {
    reload.mockResolvedValue({ ok: false, error: 'db down' });
    const res = await request(app).put('/sounds/1').send({});
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ saved: true });
    expect(res.headers[RELOAD_FAILED_HEADER.toLowerCase()]).toBe('1');
    expect(res.headers['access-control-expose-headers']).toContain(RELOAD_FAILED_HEADER);
  });

  it('still responds if the reload itself throws', async () => {
    reload.mockRejectedValue(new Error('boom'));
    const res = await request(app).post('/items').send({});
    expect(res.status).toBe(201);
  });
});
