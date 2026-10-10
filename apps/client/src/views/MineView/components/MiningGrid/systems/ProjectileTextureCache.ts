import { Assets, Texture } from 'pixi.js';
import { getAssetUrl } from '@mine-me/shared';

/**
 * Textures for projectiles, keyed by the sprite URL the server sends with each shot (the sprite of
 * the ammo item the equipped weapon fired). Nothing here knows what a bullet is called.
 *
 * `get` never blocks: the first time a URL is seen it starts loading and returns null (the renderer
 * draws a placeholder for that projectile); later projectiles get the real texture.
 */
export class ProjectileTextureCache {
  private readonly textures = new Map<string, Texture>();
  private readonly pending = new Set<string>();
  private readonly failed = new Set<string>();

  private readonly load: (url: string) => Promise<Texture>;

  constructor(load: (url: string) => Promise<Texture> = (url) => Assets.load(getAssetUrl(url))) {
    this.load = load;
  }

  /** The texture for `url` if it has loaded; otherwise null (and loading starts if it hasn't yet). */
  public get = (url: string | null | undefined): Texture | null => {
    if (!url) return null;
    const cached = this.textures.get(url);
    if (cached) return cached;
    if (this.pending.has(url) || this.failed.has(url)) return null;

    this.pending.add(url);
    this.load(url)
      .then((texture) => {
        this.textures.set(url, texture);
      })
      .catch((err) => {
        // Not retried every frame; the projectile just keeps its placeholder look
        this.failed.add(url);
        console.warn(`[Mining] Could not load projectile sprite ${url}`, err);
      })
      .finally(() => {
        this.pending.delete(url);
      });
    return null;
  };
}
