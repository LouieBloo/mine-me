import type { MiningClientTile } from '@mine-me/shared';
import { isTileTransparent, MINING_CONFIG } from '@mine-me/shared';

/** Rows below the max sun depth that can still receive downward corner diffusion. */
const DIFFUSION_ROW_PADDING = 2;
const DOWNWARD_DIFFUSION = 0.65;

/** Number of grid rows the sun can ever touch (shaft depth + diffusion padding + one row of margin). */
export function getSunlightRowCount(gridHeight: number, maxDepth: number = MINING_CONFIG.SUNLIGHT_MAX_DEPTH): number {
  return Math.min(gridHeight, Math.ceil(maxDepth) + DIFFUSION_ROW_PADDING + 1);
}

/**
 * Compact string of which sun-affecting tiles are open air. Equal signatures mean the sunlight map
 * would be identical, so callers can skip the recompute (e.g. fog-of-war reveals of solid tiles).
 */
export function getSunlightSignature(
  grid: MiningClientTile[][],
  maxDepth: number = MINING_CONFIG.SUNLIGHT_MAX_DEPTH
): string {
  if (!grid || grid.length === 0 || !grid[0]) return '';
  const rows = getSunlightRowCount(grid.length, maxDepth);
  let sig = `${grid[0].length}x${grid.length}:`;
  for (let y = 0; y < rows; y++) {
    const row = grid[y];
    for (let x = 0; x < row.length; x++) {
      sig += isTileTransparent(row[x].type) ? '1' : '0';
    }
  }
  return sig;
}

/**
 * Calculates dynamic 2D sunlight penetration through excavated tunnels and shafts.
 * Sunlight enters from the surface (y = 0) and travels downward through continuous air/openings,
 * attenuating with depth and diffusing sideways into adjacent open air.
 *
 * Only the top `getSunlightRowCount` rows are returned; deeper rows can never be lit.
 */
export function calculateSunlightMap(
  grid: MiningClientTile[][],
  maxDepth: number = MINING_CONFIG.SUNLIGHT_MAX_DEPTH,
  lateralFalloff: number = MINING_CONFIG.SUNLIGHT_LATERAL_FALLOFF
): number[][] {
  if (!grid || grid.length === 0 || !grid[0] || grid[0].length === 0) {
    return [];
  }

  const height = grid.length;
  const width = grid[0].length;
  const rows = getSunlightRowCount(height, maxDepth);
  const effectiveMaxDepth = Math.min(rows - 1, Math.ceil(maxDepth));

  const sunlight: number[][] = Array.from({ length: rows }, () => new Array<number>(width).fill(0));

  const isAirTile = (x: number, y: number): boolean => {
    if (x < 0 || x >= width || y < 0 || y >= rows) return false;
    return isTileTransparent(grid[y][x].type);
  };

  // Flat queue of (x, y) pairs; the light value is read back from the map.
  const queue: number[] = [];

  // 1. Direct vertical sunlight shafts
  for (let x = 0; x < width; x++) {
    for (let y = 0; y <= effectiveMaxDepth; y++) {
      if (!isAirTile(x, y)) break;

      // Smooth cosine attenuation from the surface rather than a harsh linear falloff
      const depthRatio = Math.min(1.0, y / maxDepth);
      const depthIntensity = Math.max(0, 0.5 + 0.5 * Math.cos(depthRatio * Math.PI));
      if (depthIntensity <= 0.01) break;

      sunlight[y][x] = depthIntensity;
      queue.push(x, y);
    }
  }

  // 2. Lateral and downward diffusion
  const maxDiffusionDepth = Math.min(rows - 1, effectiveMaxDepth + DIFFUSION_ROW_PADDING);
  const spread = (nx: number, ny: number, light: number): void => {
    if (ny > maxDiffusionDepth || !isAirTile(nx, ny)) return;
    if (light > sunlight[ny][nx] + 0.02) {
      sunlight[ny][nx] = light;
      queue.push(nx, ny);
    }
  };

  for (let head = 0; head < queue.length; head += 2) {
    const x = queue[head];
    const y = queue[head + 1];
    const light = sunlight[y][x];
    if (light <= 0.05) continue;

    spread(x - 1, y, light * lateralFalloff);
    spread(x + 1, y, light * lateralFalloff);
    spread(x, y + 1, light * DOWNWARD_DIFFUSION);
  }

  return sunlight;
}

export interface SunlightPixelOptions {
  /** Pixels per tile in the output buffer (matches one lightmap texel per pixel). */
  pixelsPerTile: number;
  /** Sun colour as 0xRRGGBB. */
  color: number;
  /** Peak alpha for a fully lit tile. */
  maxAlpha: number;
}

/**
 * Turns the per-tile sunlight map into a premultiplied RGBA pixel field (width * ppt by rows * ppt).
 *
 * Each pixel in an open tile bilinearly interpolates between the four nearest tile centres, so beam
 * edges and shadow penumbras ramp smoothly instead of stepping per tile. Solid tiles are never lit
 * and are clamped to the sampling tile's own value, so they don't darken the air next to them.
 * `out` is reused when it is already the right size so a refresh doesn't allocate.
 */
export function buildSunlightPixels(
  sunlight: number[][],
  grid: MiningClientTile[][],
  options: SunlightPixelOptions,
  out?: Uint8Array
): { pixels: Uint8Array; width: number; height: number } {
  const rows = sunlight.length;
  const cols = rows > 0 ? sunlight[0].length : 0;
  const { pixelsPerTile: ppt, color, maxAlpha } = options;
  const width = cols * ppt;
  const height = rows * ppt;
  const size = width * height * 4;
  const pixels = out && out.length === size ? out : new Uint8Array(size);
  pixels.fill(0);
  if (size === 0) return { pixels, width, height };

  const cr = (color >> 16) & 0xff;
  const cg = (color >> 8) & 0xff;
  const cb = color & 0xff;

  const isAir = (x: number, y: number): boolean =>
    x >= 0 && x < cols && y >= 0 && y < rows && isTileTransparent(grid[y][x].type);

  // Value of neighbour (nx, ny) as seen from an air tile with value `own`: solid/out-of-bounds clamp to own.
  const sample = (nx: number, ny: number, own: number): number => (isAir(nx, ny) ? sunlight[ny][nx] : own);

  for (let ty = 0; ty < rows; ty++) {
    for (let tx = 0; tx < cols; tx++) {
      if (!isAir(tx, ty)) continue;
      const own = sunlight[ty][tx];

      // Skip tiles where this tile and all neighbours are dark.
      const l = sample(tx - 1, ty, own);
      const r = sample(tx + 1, ty, own);
      const u = sample(tx, ty - 1, own);
      const d = sample(tx, ty + 1, own);
      const ul = sample(tx - 1, ty - 1, own);
      const ur = sample(tx + 1, ty - 1, own);
      const dl = sample(tx - 1, ty + 1, own);
      const dr = sample(tx + 1, ty + 1, own);
      if (own <= 0.001 && l <= 0.001 && r <= 0.001 && u <= 0.001 && d <= 0.001) continue;

      for (let py = 0; py < ppt; py++) {
        // Offset from the tile centre in tiles: [-0.5, 0.5)
        const fy = (py + 0.5) / ppt - 0.5;
        const wy = Math.abs(fy);
        const top = fy < 0;
        for (let px = 0; px < ppt; px++) {
          const fx = (px + 0.5) / ppt - 0.5;
          const wx = Math.abs(fx);
          const left = fx < 0;

          const horiz = left ? l : r;
          const vert = top ? u : d;
          const diag = top ? (left ? ul : ur) : left ? dl : dr;

          const value =
            own * (1 - wx) * (1 - wy) + horiz * wx * (1 - wy) + vert * (1 - wx) * wy + diag * wx * wy;
          const a = Math.min(1, value * maxAlpha) * 255;
          if (a < 1) continue;

          const i = ((ty * ppt + py) * width + tx * ppt + px) * 4;
          const alpha = a / 255;
          pixels[i] = Math.round(cr * alpha);
          pixels[i + 1] = Math.round(cg * alpha);
          pixels[i + 2] = Math.round(cb * alpha);
          pixels[i + 3] = Math.round(a);
        }
      }
    }
  }

  return { pixels, width, height };
}
