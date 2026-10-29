import { Texture } from 'pixi.js';
import { silhouetteHeights, type SurfaceLayerShape } from '@mine-me/shared';
import { cloudPuffs, silhouettePolygon } from '@mine-me/shared';

/**
 * Pictures drawn in code for everything on the surface that has no uploaded art yet (ticket 137 replaces them): scenery
 * silhouettes, cloud puffs, a rain streak, a snowflake, a fog band and a splash. Each one is drawn once into a small canvas.
 * A browser without a canvas gets a plain white texture, so the surface still draws (just without the soft shapes).
 */

/** The bits of the 2D canvas the painters use (so tests can pass a fake). */
export interface PaintContext {
  clearRect(x: number, y: number, w: number, h: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  closePath(): void;
  fill(): void;
  stroke(): void;
  ellipse(x: number, y: number, rx: number, ry: number, rotation: number, start: number, end: number): void;
  createLinearGradient(x0: number, y0: number, x1: number, y1: number): { addColorStop(offset: number, color: string): void };
  fillStyle: unknown;
  strokeStyle: unknown;
  lineWidth: number;
  lineCap: string;
  globalAlpha: number;
  fillRect(x: number, y: number, w: number, h: number): void;
}

export interface PaintCanvas {
  width: number;
  height: number;
  getContext(kind: '2d'): PaintContext | null;
}

export type CanvasFactory = (width: number, height: number) => PaintCanvas | null;

/** The browser's canvas, or null where there is none (tests, odd environments). */
export const documentCanvas: CanvasFactory = (width, height) => {
  if (typeof document === 'undefined') return null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas as unknown as PaintCanvas;
  } catch {
    return null;
  }
};

/** Draws with `paint` on a fresh canvas and makes a texture of it; a white texture when no canvas can be had. */
export function paintTexture(width: number, height: number, paint: (ctx: PaintContext, w: number, h: number) => void, factory: CanvasFactory = documentCanvas): Texture {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const canvas = factory(w, h);
  let ctx: PaintContext | null = null;
  try {
    ctx = canvas?.getContext('2d') ?? null;
  } catch {
    ctx = null;
  }
  if (!canvas || !ctx) return Texture.WHITE;
  paint(ctx, w, h);
  return Texture.from(canvas as unknown as HTMLCanvasElement);
}

const css = (color: number): string => `#${(color & 0xffffff).toString(16).padStart(6, '0')}`;

/** A scenery strip: the silhouette of `shape` in `color`, `width` px per tile (it repeats seamlessly), standing on the bottom edge. */
export function silhouetteTexture(shape: SurfaceLayerShape, seed: number, color: number, width: number, height: number, factory?: CanvasFactory): Texture {
  const heights = silhouetteHeights(shape, seed, Math.max(16, Math.round(width / 6)));
  return paintTexture(width, height, (ctx, w, h) => {
    const points = silhouettePolygon(heights, w, h);
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = css(color);
    ctx.beginPath();
    ctx.moveTo(points[0], points[1]);
    for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i], points[i + 1]);
    ctx.closePath();
    ctx.fill();
  }, factory);
}

/** A white cloud made of soft puffs; the weather tints it grey. */
export function cloudTexture(variant: number, width: number, height: number, factory?: CanvasFactory): Texture {
  return paintTexture(width, height, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#ffffff';
    for (const puff of cloudPuffs(variant)) {
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.ellipse(puff.x * w, puff.y * h, puff.rx * w, puff.ry * h, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }, factory);
}

/** A thin falling streak, brightest at the bottom. */
export function rainTexture(factory?: CanvasFactory): Texture {
  return paintTexture(3, 28, (ctx, w, h) => {
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, 'rgba(210,225,255,0)');
    gradient.addColorStop(1, 'rgba(210,225,255,0.9)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
  }, factory);
}

/** A soft white flake. */
export function snowTexture(factory?: CanvasFactory): Texture {
  return paintTexture(8, 8, (ctx, w, h) => {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(w / 2, h / 2, w / 2 - 0.5, h / 2 - 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }, factory);
}

/** A wide soft band of fog that fades out at the top and bottom. */
export function fogTexture(factory?: CanvasFactory): Texture {
  return paintTexture(256, 64, (ctx, w, h) => {
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, 'rgba(235,240,245,0)');
    gradient.addColorStop(0.5, 'rgba(235,240,245,0.85)');
    gradient.addColorStop(1, 'rgba(235,240,245,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
  }, factory);
}

/** A small ring for a raindrop landing. */
export function splashTexture(factory?: CanvasFactory): Texture {
  return paintTexture(12, 6, (ctx, w, h) => {
    ctx.strokeStyle = 'rgba(220,232,255,0.9)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(w / 2, h / 2, w / 2 - 1, h / 2 - 1, 0, 0, Math.PI * 2);
    ctx.stroke();
  }, factory);
}
