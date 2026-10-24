import type { DoodadAnchor } from '@mine-me/shared';
import { PREVIEW_TILE, placeholderColor, type PreviewFrame, type PreviewPiece, type PreviewScene } from './doodadPreviewScene';

/** The parts of a 2D canvas context the preview draws with, so it can be tested with a recording stand-in. */
export type PreviewContext = Pick<
  CanvasRenderingContext2D,
  | 'save' | 'restore' | 'translate' | 'rotate' | 'scale' | 'fillRect' | 'strokeRect' | 'clearRect' | 'beginPath' | 'moveTo' | 'lineTo' | 'closePath' | 'arc' | 'ellipse'
  | 'fill' | 'stroke' | 'drawImage' | 'createRadialGradient' | 'fillStyle' | 'strokeStyle' | 'lineWidth' | 'globalAlpha' | 'globalCompositeOperation'
>;

export const BLOCK_COLOR = '#5b4636';
export const BACKGROUND_COLOR = '#1b120b';
export const GRID_COLOR = 'rgba(255,255,255,0.05)';
export const MARKER_COLORS = { anchor: '#ffffff', particle: '#f59e0b', light: '#38bdf8', pivot: '#e879f9' } as const;

/** The fake blocks around the doodad. */
export function drawScene(ctx: PreviewContext, scene: PreviewScene): void {
  const w = scene.cols * PREVIEW_TILE;
  const h = scene.rows * PREVIEW_TILE;
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = BACKGROUND_COLOR;
  ctx.fillRect(0, 0, w, h);
  for (let y = 0; y < scene.rows; y++) {
    for (let x = 0; x < scene.cols; x++) {
      if (!scene.isSolid(x, y)) continue;
      ctx.fillStyle = BLOCK_COLOR;
      ctx.fillRect(x * PREVIEW_TILE, y * PREVIEW_TILE, PREVIEW_TILE, PREVIEW_TILE);
      ctx.strokeStyle = GRID_COLOR;
      ctx.lineWidth = 1;
      ctx.strokeRect(x * PREVIEW_TILE + 0.5, y * PREVIEW_TILE + 0.5, PREVIEW_TILE - 1, PREVIEW_TILE - 1);
    }
  }
}

/** The recognisable shape drawn while a doodad has no picture, in a box of `width` x `height` with the origin at its top-left. */
export function drawPlaceholder(ctx: PreviewContext, anchor: DoodadAnchor, key: string, width: number, height: number): void {
  ctx.fillStyle = placeholderColor(key);
  ctx.globalAlpha *= 0.9;
  ctx.beginPath();
  switch (anchor) {
    case 'FLOOR': {
      // A mushroom: a stem under a round cap
      ctx.fillRect(width * 0.42, height * 0.45, width * 0.16, height * 0.55);
      ctx.ellipse(width / 2, height * 0.45, width * 0.45, height * 0.35, 0, Math.PI, 0);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'CEILING': {
      // A stalactite: a point hanging from the top
      ctx.moveTo(width * 0.2, 0);
      ctx.lineTo(width * 0.8, 0);
      ctx.lineTo(width / 2, height);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'WALL': {
      // A patch of moss clinging to the wall edge
      ctx.ellipse(width * 0.3, height / 2, width * 0.3, height * 0.45, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'AIR': {
      ctx.arc(width / 2, height / 2, Math.min(width, height) * 0.2, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
  }
}

/** One piece (the main picture or a part) at its pose. `image` is its loaded picture; without one the placeholder is drawn. */
export function drawPiece(ctx: PreviewContext, piece: PreviewPiece, image: CanvasImageSource | null, anchor: DoodadAnchor, key: string): void {
  ctx.save();
  ctx.translate(piece.x, piece.y);
  ctx.rotate(piece.rotation);
  ctx.scale(piece.scaleX, piece.scaleY);
  ctx.globalAlpha = piece.alpha;
  const left = -piece.pivotX * piece.width;
  const top = -piece.pivotY * piece.height;
  if (image && piece.url) {
    ctx.drawImage(image, left, top, piece.width, piece.height);
  } else {
    ctx.translate(left, top);
    drawPlaceholder(ctx, anchor, key, piece.width, piece.height);
  }
  ctx.restore();
}

/** The soft glow of the doodad's light. */
export function drawLight(ctx: PreviewContext, light: NonNullable<PreviewFrame['light']>, at: { x: number; y: number }): void {
  if (light.strength <= 0 || light.radius <= 0) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const gradient = ctx.createRadialGradient(at.x, at.y, 0, at.x, at.y, light.radius);
  gradient.addColorStop(0, light.color);
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = Math.min(1, light.strength) * 0.7;
  ctx.fillStyle = gradient;
  ctx.fillRect(at.x - light.radius, at.y - light.radius, light.radius * 2, light.radius * 2);
  ctx.restore();
}

/** The falling drop of a `drip` motion. */
export function drawDrop(ctx: PreviewContext, drop: NonNullable<PreviewFrame['drop']>): void {
  ctx.save();
  ctx.globalAlpha = Math.max(0, drop.alpha) * 0.9;
  ctx.fillStyle = '#bfe3ff';
  ctx.beginPath();
  ctx.ellipse(drop.x, drop.y, 3, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** A small ring or cross marking a place (the anchor point, the light, the particles, a part's pivot). */
export function drawMarker(ctx: PreviewContext, at: { x: number; y: number }, color: string, kind: 'cross' | 'ring' = 'ring'): void {
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  if (kind === 'ring') {
    ctx.arc(at.x, at.y, 6, 0, Math.PI * 2);
  } else {
    ctx.moveTo(at.x - 7, at.y);
    ctx.lineTo(at.x + 7, at.y);
    ctx.moveTo(at.x, at.y - 7);
    ctx.lineTo(at.x, at.y + 7);
  }
  ctx.stroke();
  ctx.restore();
}

/** The dummy body that is dragged past the doodad. */
export function drawDummy(ctx: PreviewContext, at: { x: number; y: number }, radiusPx: number, moving: boolean): void {
  ctx.save();
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = moving ? '#fb7185' : '#94a3b8';
  ctx.beginPath();
  ctx.arc(at.x, at.y, radiusPx, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}
