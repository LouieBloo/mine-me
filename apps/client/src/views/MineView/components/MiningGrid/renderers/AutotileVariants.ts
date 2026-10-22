import { Texture } from 'pixi.js';
import {
  autotileHasEffect,
  autotileStyleKey,
  drawAutotileVariant,
  resolveAutotileStyle,
  type AutotileConfig,
  type AutotileStyle,
} from '@mine-me/shared';

/** What the variants are built from and into; swapped out in tests. */
export interface AutotileCanvasFactory {
  /** A drawing surface of this size, or null when the environment has none. */
  createCanvas(width: number, height: number): { canvas: HTMLCanvasElement | OffscreenCanvas; ctx: CanvasRenderingContext2D } | null;
  /** The Pixi texture showing a canvas. */
  toTexture(canvas: HTMLCanvasElement | OffscreenCanvas): Texture;
}

const browserCanvasFactory: AutotileCanvasFactory = {
  createCanvas(width, height) {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    return ctx ? { canvas, ctx } : null;
  },
  toTexture: (canvas) => Texture.from(canvas as HTMLCanvasElement),
};

/**
 * The edge look of terrain (ticket 094): from a block's one texture it makes the picture for each combination of
 * exposed sides (rim along the exposed sides, rounded corners where two meet). A variant is drawn the first time
 * it is asked for and then kept, so a cell costs a map lookup. A cell with no exposed side, a block with no look
 * to apply, or a texture that cannot be drawn to a canvas all just get the plain texture.
 */
export class AutotileVariants {
  private readonly cache = new Map<Texture, Map<string, Texture>>();
  private defaults: AutotileConfig | null = null;
  private readonly overrides = new Map<number, AutotileConfig | null>();

  private readonly factory: AutotileCanvasFactory;

  public constructor(factory: AutotileCanvasFactory = browserCanvasFactory) {
    this.factory = factory;
  }

  /** The map's default look and each block type's own override. Anything built from an older look is dropped. */
  public configure(defaults: AutotileConfig | null | undefined, overrides: Map<number, AutotileConfig | null | undefined> = new Map()): void {
    this.defaults = defaults ?? null;
    this.overrides.clear();
    for (const [type, config] of overrides) this.overrides.set(type, config ?? null);
    this.cache.clear();
  }

  /** The style a block type is drawn with: built-in default, then the map's, then the block's own. */
  public styleFor(tileType: number): AutotileStyle {
    return resolveAutotileStyle(this.defaults, this.overrides.get(tileType));
  }

  /** The texture a cell of `tileType` shows, given its mask of exposed sides. */
  public textureFor(tileType: number, base: Texture, mask: number): Texture {
    if (mask === 0) return base;
    const style = this.styleFor(tileType);
    if (!autotileHasEffect(style)) return base;

    let variants = this.cache.get(base);
    if (!variants) {
      variants = new Map();
      this.cache.set(base, variants);
    }
    const key = `${mask}|${autotileStyleKey(style)}`;
    let variant = variants.get(key);
    if (!variant) {
      variant = this.build(base, mask, style) ?? base;
      variants.set(key, variant);
    }
    return variant;
  }

  private build(base: Texture, mask: number, style: AutotileStyle): Texture | null {
    const image = base.source?.resource as CanvasImageSource | undefined;
    const frame = base.frame;
    if (!image || !frame || frame.width <= 0 || frame.height <= 0) return null;
    const width = Math.round(frame.width);
    const height = Math.round(frame.height);
    const surface = this.factory.createCanvas(width, height);
    if (!surface) return null;
    try {
      drawAutotileVariant(surface.ctx, image, width, height, mask, style, { x: frame.x, y: frame.y, width: frame.width, height: frame.height });
      return this.factory.toTexture(surface.canvas);
    } catch (err) {
      // A texture that cannot be read (e.g. not yet decoded) just stays plain
      console.warn('[AutotileVariants] Could not draw a variant:', err);
      return null;
    }
  }
}

/** The one set of variants the mine draws with, set up when a mine loads (see useMiningScene). */
export const autotileVariants = new AutotileVariants();
