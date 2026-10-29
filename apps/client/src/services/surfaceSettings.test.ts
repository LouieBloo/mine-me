import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SurfaceSettingsStore } from './surfaceSettings';

beforeEach(() => localStorage.clear());

describe('SurfaceSettingsStore', () => {
  it('starts with flashes on', () => {
    expect(new SurfaceSettingsStore().reduceFlashes).toBe(false);
  });

  it('remembers the choice for next time', () => {
    new SurfaceSettingsStore().setReduceFlashes(true);
    expect(new SurfaceSettingsStore().reduceFlashes).toBe(true);
  });

  it('tells listeners, until they unsubscribe', () => {
    const store = new SurfaceSettingsStore();
    const listener = vi.fn();
    const off = store.subscribe(listener);
    store.setReduceFlashes(true);
    expect(listener).toHaveBeenCalledWith({ reduceFlashes: true });
    off();
    store.setReduceFlashes(false);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('copes with stored junk and with storage that refuses', () => {
    localStorage.setItem('nvg_surface_settings', '{not json');
    expect(new SurfaceSettingsStore().reduceFlashes).toBe(false);
    localStorage.setItem('nvg_surface_settings', JSON.stringify({ reduceFlashes: 'yes' }));
    expect(new SurfaceSettingsStore().reduceFlashes).toBe(false);
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('full'); });
    const store = new SurfaceSettingsStore();
    expect(() => store.setReduceFlashes(true)).not.toThrow();
    expect(store.reduceFlashes).toBe(true);
    spy.mockRestore();
  });
});
