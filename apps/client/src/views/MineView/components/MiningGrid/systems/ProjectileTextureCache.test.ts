import { describe, it, expect, vi } from 'vitest';
import type { Texture } from 'pixi.js';
import { ProjectileTextureCache } from './ProjectileTextureCache';

const tex = (name: string) => ({ name }) as unknown as Texture;
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('ProjectileTextureCache', () => {
  it('returns null without loading when there is no sprite url', () => {
    const load = vi.fn();
    const cache = new ProjectileTextureCache(load);
    expect(cache.get(null)).toBeNull();
    expect(cache.get(undefined)).toBeNull();
    expect(cache.get('')).toBeNull();
    expect(load).not.toHaveBeenCalled();
  });

  it('returns null the first time, starts one load, then the texture once it has loaded', async () => {
    const load = vi.fn().mockResolvedValue(tex('ammo'));
    const cache = new ProjectileTextureCache(load);
    expect(cache.get('/a.png')).toBeNull();
    expect(cache.get('/a.png')).toBeNull(); // still pending: no second load
    expect(load).toHaveBeenCalledTimes(1);
    await flush();
    expect(cache.get('/a.png')).toEqual(tex('ammo'));
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('keeps different ammo sprites apart', async () => {
    const load = vi.fn((url: string) => Promise.resolve(tex(url)));
    const cache = new ProjectileTextureCache(load);
    cache.get('/bullet.png');
    cache.get('/arrow.png');
    await flush();
    expect(cache.get('/bullet.png')).toEqual(tex('/bullet.png'));
    expect(cache.get('/arrow.png')).toEqual(tex('/arrow.png'));
  });

  it('warns once and does not retry a sprite that failed to load', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const load = vi.fn().mockRejectedValue(new Error('404'));
    const cache = new ProjectileTextureCache(load);
    cache.get('/missing.png');
    await flush();
    expect(cache.get('/missing.png')).toBeNull();
    await flush();
    expect(load).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});
