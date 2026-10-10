import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { buildAssetManifest, memoizeManifest } from './assetManifest.service';

describe('buildAssetManifest', () => {
  let root: string;
  const touch = (rel: string) => {
    const file = path.join(root, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, 'x');
  };

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'assets-'));
    touch('sprites/mobs/mole.png');
    touch('mining/dirt.JPG');
    touch('sounds/items/shot.wav');
    touch('sounds/blocks/break.mp3');
    touch('sounds/bgm_track.mp3');
    touch('cities/map.png');
    touch('testscreen.mp4');
    touch('sprites/mobs/atlas.json');
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it('lists images and sounds by the url they are served at, sorted, and ignores other files', () => {
    const m = buildAssetManifest(root);
    expect(m.images).toEqual(['/assets/cities/map.png', '/assets/mining/dirt.JPG', '/assets/sprites/mobs/mole.png']);
    expect(m.sounds).toEqual(['/assets/sounds/bgm_track.mp3', '/assets/sounds/blocks/break.mp3', '/assets/sounds/items/shot.wav']);
  });

  it('leaves out excluded top-level folders and excluded urls (e.g. background music)', () => {
    const m = buildAssetManifest(root, { excludeDirs: ['cities'], excludeUrls: ['/assets/sounds/bgm_track.mp3'] });
    expect(m.images).not.toContain('/assets/cities/map.png');
    expect(m.sounds).toEqual(['/assets/sounds/blocks/break.mp3', '/assets/sounds/items/shot.wav']);
  });

  it('only excludes a folder at the top level, not a same-named folder deeper down', () => {
    touch('sprites/cities/icon.png');
    expect(buildAssetManifest(root, { excludeDirs: ['cities'] }).images).toContain('/assets/sprites/cities/icon.png');
  });

  it('returns an empty manifest when the folder does not exist', () => {
    expect(buildAssetManifest(path.join(root, 'nope'))).toEqual({ images: [], sounds: [] });
  });
});

describe('memoizeManifest', () => {
  it('rebuilds only after the ttl has passed', async () => {
    const build = vi.fn(async () => ({ images: [], sounds: [] }));
    let t = 0;
    const get = memoizeManifest(build, 1000, () => t);
    await get();
    t = 999;
    await get();
    expect(build).toHaveBeenCalledTimes(1);
    t = 1000;
    await get();
    expect(build).toHaveBeenCalledTimes(2);
  });
});
