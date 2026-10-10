import fs from 'fs';
import path from 'path';

export interface AssetManifest {
  /** Image urls (`/assets/...`) the game draws. */
  images: string[];
  /** Short sound effects the game plays (background music is streamed, not listed). */
  sounds: string[];
}

export interface AssetManifestOptions {
  /** Top-level folders under the assets root that are not part of the mine (e.g. the world map). */
  excludeDirs?: string[];
  /** Urls to leave out, e.g. the background music tracks. */
  excludeUrls?: Iterable<string>;
}

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg']);
const SOUND_EXTENSIONS = new Set(['.mp3', '.wav', '.ogg', '.m4a']);

/**
 * Lists every image and sound under `assetsRoot` as the `/assets/...` url it is served at, so the
 * client can load all of them while the loading screen is up. Anything else (video, json...) is ignored.
 */
export function buildAssetManifest(assetsRoot: string, options: AssetManifestOptions = {}): AssetManifest {
  const excludeDirs = new Set(options.excludeDirs ?? []);
  const excludeUrls = new Set(options.excludeUrls ?? []);
  const images: string[] = [];
  const sounds: string[] = [];

  const walk = (dir: string, urlPrefix: string, isRoot: boolean): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // a missing assets folder just means an empty manifest
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (isRoot && excludeDirs.has(entry.name)) continue;
        walk(path.join(dir, entry.name), `${urlPrefix}/${entry.name}`, false);
        continue;
      }
      const url = `${urlPrefix}/${entry.name}`;
      if (excludeUrls.has(url)) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (IMAGE_EXTENSIONS.has(ext)) images.push(url);
      else if (SOUND_EXTENSIONS.has(ext)) sounds.push(url);
    }
  };

  walk(assetsRoot, '/assets', true);
  return { images: images.sort(), sounds: sounds.sort() };
}

/** Wraps a builder so a burst of requests scans the disk at most once per `ttlMs`. */
export function memoizeManifest(build: () => Promise<AssetManifest>, ttlMs: number, now: () => number = Date.now) {
  let cached: { at: number; value: AssetManifest } | null = null;
  return async (): Promise<AssetManifest> => {
    if (cached && now() - cached.at < ttlMs) return cached.value;
    const value = await build();
    cached = { at: now(), value };
    return value;
  };
}
