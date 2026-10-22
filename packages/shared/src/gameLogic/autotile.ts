import { MiningTileType, isTileSolid, type MiningClientTile } from '../types/mining';
import { isPieceType } from './pieces';

/**
 * Autotiling from one square texture (ticket 094). A terrain cell's picture depends on which of its four sides face
 * open space: the picture gets a rim along those sides and rounded corners where two of them meet. Nothing here
 * needs more than the block's single texture.
 */

/** Bits of an autotile mask: set when that side of the cell is exposed (not joined to more terrain). */
export const AUTOTILE_TOP = 1;
export const AUTOTILE_RIGHT = 2;
export const AUTOTILE_BOTTOM = 4;
export const AUTOTILE_LEFT = 8;

/** How an autotiled block looks at its edges. Sizes are fractions of the block, so any drawn size works. */
export interface AutotileStyle {
  /** Corner radius where two exposed sides meet, 0 (square) to 0.5 (a half-block). */
  radius: number;
  /** How far the soft inner shadow reaches in from an exposed side, 0 to 0.5. */
  rimWidth: number;
  /** How dark the rim is, 0 (none) to 1. */
  rimStrength: number;
  /** CSS hex colour of the rim. */
  rimColor: string;
}

/** What a block (or the map) stores: any field left out falls back to the next layer. */
export type AutotileConfig = Partial<AutotileStyle>;

export const DEFAULT_AUTOTILE_STYLE: AutotileStyle = {
  radius: 0.28,
  rimWidth: 0.22,
  rimStrength: 0.55,
  rimColor: '#000000',
};

const STYLE_RANGES: Record<'radius' | 'rimWidth' | 'rimStrength', [number, number]> = {
  radius: [0, 0.5],
  rimWidth: [0, 0.5],
  rimStrength: [0, 1],
};

/** Layers a style: the default, then the map's, then the block's own, each field falling through when left out. */
export function resolveAutotileStyle(...layers: Array<AutotileConfig | null | undefined>): AutotileStyle {
  const style: AutotileStyle = { ...DEFAULT_AUTOTILE_STYLE };
  for (const layer of layers) {
    if (!layer) continue;
    for (const key of Object.keys(STYLE_RANGES) as Array<keyof typeof STYLE_RANGES>) {
      const value = layer[key];
      if (typeof value === 'number' && Number.isFinite(value)) {
        const [min, max] = STYLE_RANGES[key];
        style[key] = Math.min(max, Math.max(min, value));
      }
    }
    if (typeof layer.rimColor === 'string' && HEX_COLOR.test(layer.rimColor)) style.rimColor = layer.rimColor;
  }
  return style;
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/** Problems with an autotile config sent to the server (empty = valid). `null` is valid: it means "use the default". */
export function validateAutotileConfig(config: unknown): string[] {
  if (config === null) return [];
  if (typeof config !== 'object' || Array.isArray(config)) return ['autotile must be an object or null'];
  const errors: string[] = [];
  const known = new Set<string>([...Object.keys(STYLE_RANGES), 'rimColor']);
  for (const [key, value] of Object.entries(config as Record<string, unknown>)) {
    if (!known.has(key)) {
      errors.push(`autotile.${key} is not a known field`);
    } else if (key === 'rimColor') {
      if (typeof value !== 'string' || !HEX_COLOR.test(value)) errors.push('autotile.rimColor must be a #rrggbb colour');
    } else {
      const [min, max] = STYLE_RANGES[key as keyof typeof STYLE_RANGES];
      if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
        errors.push(`autotile.${key} must be a number from ${min} to ${max}`);
      }
    }
  }
  return errors;
}

/**
 * Whether a cell is terrain that gets edges: a solid block that is not a piece. Ladders, torches, bridges, rocks
 * and chests keep their own art (ticket 094, decision 3).
 */
export function isAutotileTerrain(tile: Pick<MiningClientTile, 'type' | 'piece'>): boolean {
  if (tile.piece) return false;
  if (tile.type === MiningTileType.ROCK || tile.type === MiningTileType.CHEST) return false;
  return isTileSolid(tile.type) && !isPieceType(tile.type);
}

/**
 * The mask for the cell at (x, y) in a grid: a side is exposed when the neighbour there is revealed and is not
 * terrain. The map edge and unrevealed cells (fog) count as joined, so no edge is drawn against them.
 */
export function autotileMask(grid: MiningClientTile[][], x: number, y: number): number {
  const exposed = (nx: number, ny: number): boolean => {
    const row = grid[ny];
    if (!row) return false;
    const tile = row[nx];
    if (!tile) return false;
    return tile.revealed && !isAutotileTerrain(tile);
  };
  return (
    (exposed(x, y - 1) ? AUTOTILE_TOP : 0) |
    (exposed(x + 1, y) ? AUTOTILE_RIGHT : 0) |
    (exposed(x, y + 1) ? AUTOTILE_BOTTOM : 0) |
    (exposed(x - 1, y) ? AUTOTILE_LEFT : 0)
  );
}

/** Which corners a mask rounds: a corner is rounded when both sides that meet there are exposed. */
export function autotileCorners(mask: number): { topLeft: boolean; topRight: boolean; bottomRight: boolean; bottomLeft: boolean } {
  const has = (bit: number) => (mask & bit) !== 0;
  return {
    topLeft: has(AUTOTILE_TOP) && has(AUTOTILE_LEFT),
    topRight: has(AUTOTILE_TOP) && has(AUTOTILE_RIGHT),
    bottomRight: has(AUTOTILE_BOTTOM) && has(AUTOTILE_RIGHT),
    bottomLeft: has(AUTOTILE_BOTTOM) && has(AUTOTILE_LEFT),
  };
}

/** Whether a style changes the picture at all (a block with no radius and no rim draws its plain texture). */
export function autotileHasEffect(style: AutotileStyle): boolean {
  return style.radius > 0 || (style.rimWidth > 0 && style.rimStrength > 0);
}

/** A stable key for a style, so a cache can tell when a variant is out of date. */
export function autotileStyleKey(style: AutotileStyle): string {
  return `${style.radius}|${style.rimWidth}|${style.rimStrength}|${style.rimColor}`;
}

/** The slice of a 2D canvas context the variant drawing uses. */
type AutotileContext = Pick<
  CanvasRenderingContext2D,
  | 'save' | 'restore' | 'clearRect' | 'beginPath' | 'moveTo' | 'lineTo' | 'arc' | 'closePath' | 'clip' | 'drawImage'
  | 'createLinearGradient' | 'fillRect' | 'stroke'
> & { fillStyle: CanvasRenderingContext2D['fillStyle']; strokeStyle: CanvasRenderingContext2D['strokeStyle']; lineWidth: number; lineCap: CanvasLineCap };

function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/**
 * Draws one variant of a block: `image` cut to the corners the mask rounds, with a soft rim inside each exposed side
 * and a thin line along it. `width` x `height` is the canvas size. Mask 0 (no exposed side) just draws the image.
 */
export function drawAutotileVariant(
  ctx: AutotileContext,
  image: CanvasImageSource,
  width: number,
  height: number,
  mask: number,
  style: AutotileStyle,
  source?: { x: number; y: number; width: number; height: number }
): void {
  ctx.clearRect(0, 0, width, height);
  const r = Math.min(style.radius, 0.5) * Math.min(width, height);
  const corners = autotileCorners(mask);
  const rTL = corners.topLeft ? r : 0;
  const rTR = corners.topRight ? r : 0;
  const rBR = corners.bottomRight ? r : 0;
  const rBL = corners.bottomLeft ? r : 0;

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(rTL, 0);
  ctx.lineTo(width - rTR, 0);
  if (rTR) ctx.arc(width - rTR, rTR, rTR, -Math.PI / 2, 0);
  ctx.lineTo(width, height - rBR);
  if (rBR) ctx.arc(width - rBR, height - rBR, rBR, 0, Math.PI / 2);
  ctx.lineTo(rBL, height);
  if (rBL) ctx.arc(rBL, height - rBL, rBL, Math.PI / 2, Math.PI);
  ctx.lineTo(0, rTL);
  if (rTL) ctx.arc(rTL, rTL, rTL, Math.PI, Math.PI * 1.5);
  ctx.closePath();
  ctx.clip();
  if (source) ctx.drawImage(image, source.x, source.y, source.width, source.height, 0, 0, width, height);
  else ctx.drawImage(image, 0, 0, width, height);

  // The soft rim: a gradient from the exposed side inwards
  const shadow = Math.min(style.rimWidth, 0.5);
  if (mask !== 0 && shadow > 0 && style.rimStrength > 0) {
    const bands: Array<[bit: number, x0: number, y0: number, x1: number, y1: number]> = [
      [AUTOTILE_TOP, 0, 0, 0, shadow * height],
      [AUTOTILE_BOTTOM, 0, height, 0, height - shadow * height],
      [AUTOTILE_LEFT, 0, 0, shadow * width, 0],
      [AUTOTILE_RIGHT, width, 0, width - shadow * width, 0],
    ];
    for (const [bit, x0, y0, x1, y1] of bands) {
      if (!(mask & bit)) continue;
      const gradient = ctx.createLinearGradient(x0, y0, x1, y1);
      gradient.addColorStop(0, withAlpha(style.rimColor, style.rimStrength));
      gradient.addColorStop(1, withAlpha(style.rimColor, 0));
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
    }
  }
  ctx.restore();

  // The thin line along each exposed side (and round each rounded corner), inset so it is not cut by the canvas edge
  if (mask !== 0 && style.rimStrength > 0) {
    const line = Math.max(1, Math.min(width, height) * 0.04);
    const inset = line / 2;
    ctx.strokeStyle = withAlpha(style.rimColor, Math.min(1, style.rimStrength + 0.2));
    ctx.lineWidth = line;
    ctx.lineCap = 'butt';
    const exposed = (bit: number) => (mask & bit) !== 0;
    ctx.beginPath();
    if (exposed(AUTOTILE_TOP)) {
      ctx.moveTo(rTL, inset);
      ctx.lineTo(width - rTR, inset);
    }
    if (exposed(AUTOTILE_RIGHT)) {
      ctx.moveTo(width - inset, rTR);
      ctx.lineTo(width - inset, height - rBR);
    }
    if (exposed(AUTOTILE_BOTTOM)) {
      ctx.moveTo(width - rBR, height - inset);
      ctx.lineTo(rBL, height - inset);
    }
    if (exposed(AUTOTILE_LEFT)) {
      ctx.moveTo(inset, height - rBL);
      ctx.lineTo(inset, rTL);
    }
    if (rTR) {
      ctx.moveTo(width - rTR, inset);
      ctx.arc(width - rTR, rTR, rTR - inset, -Math.PI / 2, 0);
    }
    if (rBR) {
      ctx.moveTo(width - inset, height - rBR);
      ctx.arc(width - rBR, height - rBR, rBR - inset, 0, Math.PI / 2);
    }
    if (rBL) {
      ctx.moveTo(rBL, height - inset);
      ctx.arc(rBL, height - rBL, rBL - inset, Math.PI / 2, Math.PI);
    }
    if (rTL) {
      ctx.moveTo(inset, rTL);
      ctx.arc(rTL, rTL, rTL - inset, Math.PI, Math.PI * 1.5);
    }
    ctx.stroke();
  }
}
