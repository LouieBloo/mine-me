import { Assets } from 'pixi.js';
import { getAssetUrl } from '@mine-me/shared';

export interface AssetLists {
  images: string[];
  sounds: string[];
}

export interface PreloadSummary {
  images: { loaded: number; failed: number };
  sounds: { loaded: number; failed: number };
  /** True when loading took longer than the allowed wait; the rest keeps loading in the background. */
  timedOut: boolean;
}

/** The part of the sound manager the preloader needs. */
export interface SfxPreloader {
  preloadSfx(urls: string[], onEach?: (loaded: boolean) => void): Promise<{ loaded: number; failed: number }>;
}

const IMAGE_EXT = /\.(png|jpe?g|webp|gif|svg)(\?.*)?$/i;
const SOUND_EXT = /\.(mp3|wav|ogg|m4a)(\?.*)?$/i;
const ASSET_URL = /^(\/assets\/|https?:\/\/)/i;

/**
 * Finds every image and sound url anywhere inside the given data (items, blocks, mobs...), whatever
 * the field is called. New kinds of content that point at art or sounds are picked up without
 * listing their fields here.
 */
export function collectAssetUrls(...sources: unknown[]): AssetLists {
  const images = new Set<string>();
  const sounds = new Set<string>();
  const seen = new Set<object>();

  const visit = (value: unknown): void => {
    if (typeof value === 'string') {
      if (!ASSET_URL.test(value)) return;
      if (IMAGE_EXT.test(value)) images.add(value);
      else if (SOUND_EXT.test(value)) sounds.add(value);
    } else if (Array.isArray(value)) {
      value.forEach(visit);
    } else if (value && typeof value === 'object') {
      if (seen.has(value)) return;
      seen.add(value);
      Object.values(value as Record<string, unknown>).forEach(visit);
    }
  };
  sources.forEach(visit);
  return { images: [...images].sort(), sounds: [...sounds].sort() };
}

/** Everything under the server's assets folder that the mine can use. An empty list if it is unreachable. */
export async function fetchAssetManifest(fetchFn: typeof fetch = fetch): Promise<AssetLists> {
  try {
    const res = await fetchFn(getAssetUrl('/api/public/assets/manifest'));
    if (!res.ok) return { images: [], sounds: [] };
    const body = await res.json();
    return {
      images: Array.isArray(body?.images) ? body.images : [],
      sounds: Array.isArray(body?.sounds) ? body.sounds : [],
    };
  } catch (err) {
    console.warn('[MiningAssetPreloader] Could not fetch the asset manifest:', err);
    return { images: [], sounds: [] };
  }
}

/** Runs `task` over `items` with at most `limit` in flight; failures are counted, never thrown. */
async function runPool<T>(
  items: T[],
  limit: number,
  task: (item: T) => Promise<unknown>,
  onSettled?: () => void
): Promise<{ loaded: number; failed: number }> {
  let next = 0;
  let loaded = 0;
  let failed = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const item = items[next++];
      try {
        await task(item);
        loaded++;
      } catch {
        failed++;
      }
      onSettled?.();
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return { loaded, failed };
}

export interface PreloadOptions {
  lists: AssetLists;
  soundManager: SfxPreloader;
  /** Loads one image into the texture cache. Defaults to Pixi's Assets. */
  loadImage?: (url: string) => Promise<unknown>;
  /** Longest to wait before letting the game start anyway. */
  timeoutMs?: number;
  /** Images downloading at once. */
  concurrency?: number;
  /** Called each time one file finishes (loaded or not): how many are done out of the total. */
  onProgress?: (done: number, total: number) => void;
}

/**
 * Greedily loads every given image (into Pixi's texture cache) and sound effect (decoded, ready to
 * play) so nothing has to be fetched mid-game. Never throws; whatever fails to load is simply
 * loaded on first use as before.
 */
export async function preloadMiningAssets({
  lists,
  soundManager,
  loadImage = (url) => Assets.load(getAssetUrl(url)),
  timeoutMs = 20_000,
  concurrency = 8,
  onProgress,
}: PreloadOptions): Promise<PreloadSummary> {
  const total = lists.images.length + lists.sounds.length;
  let done = 0;
  const step = () => onProgress?.(++done, total);
  const work = Promise.all([
    runPool(lists.images, concurrency, loadImage, step),
    soundManager.preloadSfx(lists.sounds, step).catch(() => ({ loaded: 0, failed: lists.sounds.length })),
  ]).then(([images, sounds]): PreloadSummary => ({ images, sounds, timedOut: false }));

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<PreloadSummary>((resolve) => {
    timer = setTimeout(
      () =>
        resolve({
          images: { loaded: 0, failed: 0 },
          sounds: { loaded: 0, failed: 0 },
          timedOut: true,
        }),
      timeoutMs
    );
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
