import type { MiningClientTile } from '@mine-me/shared';
import { MiningTileType, MINING_CONFIG } from '@mine-me/shared';

/**
 * Calculates dynamic 2D sunlight penetration through excavated tunnels and shafts.
 * Sunlight enters from the surface (y = 0) and travels downward through continuous air/openings,
 * attenuating with depth and softly diffusing into adjacent horizontal tunnels.
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

  // Initialize sunlight matrix with 0
  const sunlight: number[][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => 0)
  );

  const isAirTile = (x: number, y: number): boolean => {
    if (x < 0 || x >= width || y < 0 || y >= height) return false;
    const tile = grid[y][x];
    return tile.type === MiningTileType.EMPTY || tile.type === MiningTileType.ENTRANCE;
  };

  // Queue for lateral diffusion BFS
  const queue: { x: number; y: number; light: number }[] = [];

  // 1. Direct Vertical Sunlight Shafts
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      if (!isAirTile(x, y)) {
        // Blocked by solid block (dirt, rock, mineral, chest)
        break;
      }

      // Vertical attenuation from surface: linear falloff to maxDepth
      const depthIntensity = Math.max(0, 1.0 - y / maxDepth);
      if (depthIntensity <= 0.01) {
        break;
      }

      sunlight[y][x] = depthIntensity;
      queue.push({ x, y, light: depthIntensity });
    }
  }

  // 2. Lateral & Diagonal Ambient Bleed Diffusion
  let head = 0;
  while (head < queue.length) {
    const { x, y, light } = queue[head++];
    if (light <= 0.05) continue;

    // Check horizontal neighbors (left and right)
    const neighbors = [
      { nx: x - 1, ny: y, factor: lateralFalloff },
      { nx: x + 1, ny: y, factor: lateralFalloff },
      { nx: x, ny: y + 1, factor: 0.65 }, // downward diffusion around corners
    ];

    for (const { nx, ny, factor } of neighbors) {
      if (isAirTile(nx, ny)) {
        const nextLight = light * factor;
        if (nextLight > sunlight[ny][nx] + 0.02) {
          sunlight[ny][nx] = nextLight;
          queue.push({ x: nx, y: ny, light: nextLight });
        }
      }
    }
  }

  return sunlight;
}
