import { describe, it, expect, vi, beforeEach } from 'vitest';

const { install } = vi.hoisted(() => ({ install: vi.fn() }));
vi.mock('../src/services/mining/definitionLoaders', () => ({ installDefinitionsFromDatabase: install }));

import { configureDefinitionReloader, reloadDefinitions } from '../src/services/mining/definitionReloader';

const fakeDb = {} as any;
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => { resolve = r; });
  return { promise, resolve };
};

describe('reloadDefinitions', () => {
  beforeEach(() => {
    install.mockReset();
    install.mockResolvedValue(undefined);
    configureDefinitionReloader(fakeDb);
  });

  it('is a no-op until configured', async () => {
    configureDefinitionReloader(null);
    expect(await reloadDefinitions()).toEqual({ ok: true });
    expect(install).not.toHaveBeenCalled();
  });

  it('reloads from the database', async () => {
    expect(await reloadDefinitions()).toEqual({ ok: true });
    expect(install).toHaveBeenCalledWith(fakeDb);
  });

  it('never overlaps, and callers that arrive mid-reload share one follow-up reload', async () => {
    const gate = deferred();
    let active = 0;
    let maxActive = 0;
    install.mockImplementation(async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await gate.promise;
      active--;
    });

    const calls = [reloadDefinitions(), reloadDefinitions(), reloadDefinitions(), reloadDefinitions()];
    await Promise.resolve();
    expect(install).toHaveBeenCalledTimes(1);

    gate.resolve();
    const results = await Promise.all(calls);
    expect(results.every((r) => r.ok)).toBe(true);
    expect(install).toHaveBeenCalledTimes(2); // the running one + a single follow-up for the other three
    expect(maxActive).toBe(1);
  });

  it('reports a failure, keeps going, and recovers on the next reload', async () => {
    install.mockRejectedValueOnce(new Error('db down'));
    expect(await reloadDefinitions()).toEqual({ ok: false, error: 'db down' });
    expect(await reloadDefinitions()).toEqual({ ok: true });
  });
});
