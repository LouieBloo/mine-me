import type { MobAtlas } from '../types';
import type { SkeletonManifest } from '../types/modularRig';

/** A mob's art: a modular skeleton, a single-sprite atlas, or nothing. */
export type MobAnimations = SkeletonManifest | MobAtlas | null | undefined;

/** True for a modular skeleton manifest (multi-part puppet). */
export function isSkeletonManifest(animations: MobAnimations): animations is SkeletonManifest {
  return !!animations && 'parts' in animations && !!animations.parts;
}

/** The single-sprite url of a mob's animations, if it is a sprite rather than a skeleton. */
export function getMobSpriteUrl(animations: MobAnimations): string | undefined {
  return animations && !isSkeletonManifest(animations) && 'url' in animations ? animations.url : undefined;
}
