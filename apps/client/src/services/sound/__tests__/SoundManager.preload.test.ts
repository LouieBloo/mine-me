import { describe, it, expect, vi, beforeEach } from 'vitest';

const { created, FakeHowl } = vi.hoisted(() => {
  const created: any[] = [];
  class FakeHowl {
    public loadState: 'loading' | 'loaded' = 'loading';
    public listeners: Record<string, Array<() => void>> = {};
    public opts: any;
    constructor(opts: any) {
      this.opts = opts;
      created.push(this);
    }
    state() { return this.loadState; }
    on() {}
    off() {}
    stereo() {}
    once(event: string, cb: () => void) { (this.listeners[event] ||= []).push(cb); }
    volume() {}
    play() { return 1; }
    stop() {}
    unload() {}
    finish() { this.loadState = 'loaded'; this.opts.onload?.(); this.listeners.load?.forEach((f) => f()); }
    fail() { this.opts.onloaderror?.(1, 'boom'); this.listeners.loaderror?.forEach((f) => f()); }
  }
  return { created, FakeHowl };
});
vi.mock('howler', () => ({ Howl: FakeHowl, Howler: { ctx: undefined } }));

import { SoundManager } from '../SoundManager';

describe('SoundManager.preloadSfx', () => {
  beforeEach(() => {
    created.length = 0;
    // The manager is a singleton that caches sounds; start each test from a clean cache
    (SoundManager.getInstance() as any).sfxCache.clear();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('starts loading every distinct sound once, and resolves when they have all loaded', async () => {
    const manager = SoundManager.getInstance();
    const done = manager.preloadSfx(['/assets/a.mp3', '/assets/b.wav', '/assets/a.mp3']);
    expect(created).toHaveLength(2);
    created.forEach((h) => h.finish());
    await expect(done).resolves.toEqual({ loaded: 2, failed: 0 });
  });

  it('counts sounds that fail to load without rejecting, and forgets them so playing retries', async () => {
    const manager = SoundManager.getInstance();
    const done = manager.preloadSfx(['/assets/ok.mp3', '/assets/bad.mp3']);
    created[0].finish();
    created[1].fail();
    await expect(done).resolves.toEqual({ loaded: 1, failed: 1 });
    manager.preloadSfx(['/assets/bad.mp3']);
    expect(created).toHaveLength(3); // a fresh attempt
  });

  it('reuses a sound that is already loaded or loading', async () => {
    const manager = SoundManager.getInstance();
    const first = manager.preloadSfx(['/assets/a.mp3']);
    const second = manager.preloadSfx(['/assets/a.mp3']);
    expect(created).toHaveLength(1);
    created[0].finish();
    await expect(first).resolves.toEqual({ loaded: 1, failed: 0 });
    await expect(second).resolves.toEqual({ loaded: 1, failed: 0 });
    await expect(manager.preloadSfx(['/assets/a.mp3'])).resolves.toEqual({ loaded: 1, failed: 0 });
  });

  it('playSfx then plays the already-decoded sound instead of loading it again', () => {
    const manager = SoundManager.getInstance();
    manager.preloadSfx(['/assets/shot.wav']);
    created[0].finish();
    manager.playSfx('/assets/shot.wav');
    expect(created).toHaveLength(1);
  });

  it('tells onEach as each sound finishes, whether it loaded or not', async () => {
    const manager = SoundManager.getInstance();
    const seen: boolean[] = [];
    const done = manager.preloadSfx(['/assets/a.mp3', '/assets/b.mp3'], (ok) => seen.push(ok));
    created[0].finish();
    expect(seen).toEqual([true]);
    created[1].fail();
    await done;
    expect(seen).toEqual([true, false]);
  });

  it('resolves immediately for an empty list', async () => {
    await expect(SoundManager.getInstance().preloadSfx([])).resolves.toEqual({ loaded: 0, failed: 0 });
  });
});
