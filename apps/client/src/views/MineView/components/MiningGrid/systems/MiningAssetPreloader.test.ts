import { describe, it, expect, vi, afterEach } from 'vitest';
import { collectAssetUrls, fetchAssetManifest, preloadMiningAssets } from './MiningAssetPreloader';

describe('collectAssetUrls', () => {
  it('finds image and sound urls anywhere in nested data, whatever the field is called', () => {
    const items = [
      { id: 'a', iconUrl: '/assets/icons/a.png', soundEffects: { shoot: { url: '/assets/sounds/shot.wav' } } },
      { nested: [{ deeper: { spriteUrl: '/assets/sprites/m.PNG', note: 'not an asset' } }] },
      { remote: 'https://cdn.example.com/x.jpg' },
    ];
    expect(collectAssetUrls(items)).toEqual({
      images: ['/assets/icons/a.png', '/assets/sprites/m.PNG', 'https://cdn.example.com/x.jpg'],
      sounds: ['/assets/sounds/shot.wav'],
    });
  });

  it('lists each url once across several sources, and ignores other file types and plain text', () => {
    const lists = collectAssetUrls({ a: '/assets/x.png' }, { b: '/assets/x.png', c: '/assets/data.json', d: 'hello.png', e: 5, f: null });
    expect(lists).toEqual({ images: ['/assets/x.png'], sounds: [] });
  });

  it('finds the resolved sound urls of mobs, and copes with mobs that have none', () => {
    const mobs = [
      { id: 'm1', sounds: { attack: { url: '/assets/sounds/mobs/m1/attack.mp3', volume: 1 }, death: { url: '/assets/sounds/death.wav' } } },
      { id: 'm2', sounds: null },
      { id: 'm3' },
    ];
    expect(collectAssetUrls(mobs).sounds).toEqual(['/assets/sounds/death.wav', '/assets/sounds/mobs/m1/attack.mp3']);
    expect(collectAssetUrls(undefined, [])).toEqual({ images: [], sounds: [] });
  });

  it('survives circular data', () => {
    const a: Record<string, unknown> = { icon: '/assets/a.png' };
    a.self = a;
    expect(collectAssetUrls(a).images).toEqual(['/assets/a.png']);
  });
});

describe('fetchAssetManifest', () => {
  it('returns the lists the server sent', async () => {
    const fetchFn = vi.fn(async () => ({ ok: true, json: async () => ({ images: ['/assets/a.png'], sounds: ['/assets/b.mp3'] }) })) as any;
    await expect(fetchAssetManifest(fetchFn)).resolves.toEqual({ images: ['/assets/a.png'], sounds: ['/assets/b.mp3'] });
  });

  it('falls back to empty lists when the server errors, is unreachable, or sends junk', async () => {
    const empty = { images: [], sounds: [] };
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(fetchAssetManifest((async () => ({ ok: false })) as any)).resolves.toEqual(empty);
    await expect(fetchAssetManifest((async () => { throw new Error('down'); }) as any)).resolves.toEqual(empty);
    await expect(fetchAssetManifest((async () => ({ ok: true, json: async () => ({ images: 'nope' }) })) as any)).resolves.toEqual(empty);
  });
});

describe('preloadMiningAssets', () => {
  afterEach(() => vi.useRealTimers());
  const lists = { images: ['/assets/a.png', '/assets/b.png', '/assets/c.png'], sounds: ['/assets/s.mp3'] };

  it('loads every image and sound and reports the counts', async () => {
    const loadImage = vi.fn(async (_url: string) => undefined);
    const preloadSfx = vi.fn(async () => ({ loaded: 1, failed: 0 }));
    const summary = await preloadMiningAssets({ lists, soundManager: { preloadSfx }, loadImage });
    expect(loadImage.mock.calls.map((c) => c[0])).toEqual(lists.images);
    expect(preloadSfx).toHaveBeenCalledWith(lists.sounds, expect.any(Function));
    expect(summary).toEqual({ images: { loaded: 3, failed: 0 }, sounds: { loaded: 1, failed: 0 }, timedOut: false });
  });

  it('counts failures instead of throwing, for images and for sounds', async () => {
    const loadImage = vi.fn(async (url: string) => { if (url.endsWith('b.png')) throw new Error('404'); });
    const summary = await preloadMiningAssets({
      lists,
      soundManager: { preloadSfx: async () => { throw new Error('audio'); } },
      loadImage,
    });
    expect(summary.images).toEqual({ loaded: 2, failed: 1 });
    expect(summary.sounds).toEqual({ loaded: 0, failed: 1 });
  });

  it('never has more than `concurrency` images downloading at once', async () => {
    let inFlight = 0;
    let peak = 0;
    const loadImage = async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 1));
      inFlight--;
    };
    const many = { images: Array.from({ length: 20 }, (_, i) => `/assets/${i}.png`), sounds: [] };
    await preloadMiningAssets({ lists: many, soundManager: { preloadSfx: async () => ({ loaded: 0, failed: 0 }) }, loadImage, concurrency: 3 });
    expect(peak).toBe(3);
  });

  it('gives up waiting after the timeout so a stuck download cannot hold the loading screen', async () => {
    vi.useFakeTimers();
    const never = () => new Promise<never>(() => {});
    const done = preloadMiningAssets({ lists, soundManager: { preloadSfx: never }, loadImage: never, timeoutMs: 5000 });
    await vi.advanceTimersByTimeAsync(5000);
    await expect(done).resolves.toMatchObject({ timedOut: true });
  });

  it('reports progress as each file finishes, images and sounds together, ending at the total', async () => {
    const calls: Array<[number, number]> = [];
    const preloadSfx = async (urls: string[], onEach?: (ok: boolean) => void) => {
      urls.forEach(() => onEach?.(true));
      return { loaded: urls.length, failed: 0 };
    };
    await preloadMiningAssets({
      lists,
      soundManager: { preloadSfx },
      loadImage: async (url) => { if (url.endsWith('b.png')) throw new Error('x'); },
      onProgress: (d, t) => calls.push([d, t]),
    });
    expect(calls).toHaveLength(4); // a failure still counts as finished
    expect(calls.every(([, t]) => t === 4)).toBe(true);
    expect(calls.map(([d]) => d).sort()).toEqual([1, 2, 3, 4]);
  });

  it('handles nothing to load', async () => {
    const summary = await preloadMiningAssets({ lists: { images: [], sounds: [] }, soundManager: { preloadSfx: async () => ({ loaded: 0, failed: 0 }) } });
    expect(summary).toEqual({ images: { loaded: 0, failed: 0 }, sounds: { loaded: 0, failed: 0 }, timedOut: false });
  });
});
