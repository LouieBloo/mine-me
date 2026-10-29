import { Assets, Container, Sprite, Texture } from 'pixi.js';
import { CLOUD_PERIOD_PX, cloudAlpha, cloudSpecs, cloudX, getAssetUrl, lerpColor, type CloudSpec, type SurfaceEnvironmentDefinition } from '@mine-me/shared';
import { TILE_SIZE } from '../renderers/MiningTileRenderer';
import { cloudTexture } from './surfaceTextures';
import type { SurfaceTextureLoader, SurfaceView } from './SurfaceBackground';

const defaultLoad: SurfaceTextureLoader = (url) => Assets.load<Texture>(getAssetUrl(url)).catch(() => null);

/** The default most clouds, and the band they drift in (small blocks above the horizon). */
const DEFAULT_MAX_CLOUDS = 8;
const DEFAULT_MIN_HEIGHT = 8;
const DEFAULT_MAX_HEIGHT = 22;
/** A cloud is this wide in small blocks, times its own scale. */
const CLOUD_BLOCKS = 16;
/** How many different drawn clouds there are when the environment has no pictures. */
const PROCEDURAL_VARIANTS = 3;
/** The colour a storm cloud is dark grey. */
const STORM_CLOUD = 0x4d5663;

/**
 * The clouds (ticket 131): a pool of sprites drifting across the sky, each at its own speed and parallax, wrapping round.
 * Where each one is comes from the shared `cloudSpecs`, the seed and the weather clock, so every client shows the same sky; the
 * weather says how many show (the density) and how dark they are. Pictures come from the environment, or soft shapes drawn in
 * code when it has none.
 */
export class CloudField {
  private readonly container: Container;
  private readonly sprites: Sprite[] = [];
  private specs: CloudSpec[] = [];
  private textures: Texture[] = [];
  private environment: SurfaceEnvironmentDefinition;
  private generation = 0;
  private destroyed = false;
  private shown = 0;
  private readonly seed: number;
  private readonly surfaceY: number;
  private readonly tileSize: number;
  private readonly loadTexture: SurfaceTextureLoader;

  constructor(
    container: Container,
    environment: SurfaceEnvironmentDefinition,
    options: { surfaceY: number; seed: number; tileSize?: number; loadTexture?: SurfaceTextureLoader }
  ) {
    this.container = container;
    this.surfaceY = options.surfaceY;
    this.seed = options.seed;
    this.tileSize = options.tileSize ?? TILE_SIZE;
    this.loadTexture = options.loadTexture ?? defaultLoad;
    this.environment = environment;
    this.build();
  }

  /** How many clouds are showing right now (for the performance overlay). */
  public get visibleCount(): number {
    return this.shown;
  }

  /** How many cloud sprites exist. */
  public get poolSize(): number {
    return this.sprites.length;
  }

  public setEnvironment(environment: SurfaceEnvironmentDefinition): void {
    this.environment = environment;
    this.build();
  }

  /** Moves the clouds for the clock and shows as many as the cover asks for. */
  public update(view: SurfaceView, weather: { cloudDensity: number; cloudDarkness: number }, clockSeconds: number): void {
    const tint = lerpColor(0xffffff, STORM_CLOUD, weather.cloudDarkness);
    const period = Math.max(CLOUD_PERIOD_PX, view.width * 1.6);
    const clouds = this.environment.clouds;
    const low = clouds?.minHeight ?? DEFAULT_MIN_HEIGHT;
    const high = Math.max(low, clouds?.maxHeight ?? DEFAULT_MAX_HEIGHT);
    let shown = 0;
    for (let i = 0; i < this.sprites.length; i++) {
      const sprite = this.sprites[i];
      const spec = this.specs[i];
      const alpha = cloudAlpha(spec, weather.cloudDensity) * 0.92;
      const width = CLOUD_BLOCKS * this.tileSize * spec.scale;
      if (alpha <= 0.01) {
        sprite.visible = false;
        continue;
      }
      // Where the cloud would be, wrapped into the stretch of sky around the view
      const start = view.left - width;
      const along = cloudX(spec, clockSeconds, period) + view.left * spec.parallax;
      const x = start + (((along - start) % period) + period) % period;
      if (x > view.left + view.width) {
        sprite.visible = false;
        continue;
      }
      const texture = sprite.texture;
      const height = width * (texture.width > 0 ? texture.height / texture.width : 0.5);
      sprite.visible = true;
      sprite.alpha = alpha;
      sprite.tint = tint;
      sprite.width = width;
      sprite.height = height;
      sprite.position.set(x, this.surfaceY - (low + spec.y * (high - low)) * this.tileSize - height / 2);
      shown++;
    }
    this.shown = shown;
  }

  public destroy(): void {
    this.destroyed = true;
    for (const sprite of this.sprites) sprite.destroy();
    this.sprites.length = 0;
  }

  private build(): void {
    this.generation++;
    for (const sprite of this.sprites) sprite.destroy();
    this.sprites.length = 0;
    this.container.removeChildren();
    const maxCount = this.environment.clouds?.maxCount ?? DEFAULT_MAX_CLOUDS;
    this.specs = cloudSpecs(this.seed, maxCount);
    const urls = this.environment.clouds?.textureUrls ?? [];
    this.textures = Array.from({ length: PROCEDURAL_VARIANTS }, (_, v) => cloudTexture(v + this.seed, 256, 128));
    this.specs.forEach((spec) => {
      const sprite = new Sprite(this.textures[spec.variant % this.textures.length]);
      sprite.anchor.set(0);
      sprite.visible = false;
      this.sprites.push(sprite);
      this.container.addChild(sprite);
    });
    if (urls.length > 0) {
      const generation = this.generation;
      void Promise.all(urls.map((url) => this.loadTexture(url))).then((loaded) => {
        if (this.destroyed || generation !== this.generation) return;
        const good = loaded.filter((t): t is Texture => Boolean(t));
        if (good.length === 0) return;
        this.textures = good;
        this.specs.forEach((spec, i) => {
          if (!this.sprites[i].destroyed) this.sprites[i].texture = good[spec.variant % good.length];
        });
      });
    }
  }
}
