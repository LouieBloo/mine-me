import { describe, it, expect } from 'vitest';
import { getMobSpriteUrl, isSkeletonManifest } from './mobAnimations';
import type { MobAtlas } from '../types';
import type { SkeletonManifest } from '../types/modularRig';

const skeleton = { version: 1, parts: { torso: {} } } as unknown as SkeletonManifest;
const atlas: MobAtlas = { url: '/dummy.png', atlasUrl: '/dummy.json' };

describe('mob animations', () => {
  it('recognises a skeleton manifest by its parts', () => {
    expect(isSkeletonManifest(skeleton)).toBe(true);
    expect(isSkeletonManifest(atlas)).toBe(false);
    expect(isSkeletonManifest(null)).toBe(false);
    expect(isSkeletonManifest(undefined)).toBe(false);
  });

  it('gives a sprite url only for single-sprite mobs', () => {
    expect(getMobSpriteUrl(atlas)).toBe('/dummy.png');
    expect(getMobSpriteUrl(skeleton)).toBeUndefined();
    expect(getMobSpriteUrl(null)).toBeUndefined();
  });
});
