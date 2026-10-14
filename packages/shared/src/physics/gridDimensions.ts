import { MINING_CONFIG } from '../types/mining';

export interface GridDimensions {
  width: number;
  height: number;
}

/**
 * The size of a world's tile grid. A world's size belongs to its grid (rows x columns), so physics,
 * raycasts and pathfinding never assume the global default and a smaller map (e.g. the sandbox) just works.
 * A grid that is not a populated array falls back to the default mine size.
 */
export function getGridDimensions(grid: unknown): GridDimensions {
  if (Array.isArray(grid) && grid.length > 0) {
    const firstRow: unknown = grid[0];
    const width = Array.isArray(firstRow) ? firstRow.length : 0;
    if (width > 0) return { width, height: grid.length };
  }
  return { width: MINING_CONFIG.GRID_WIDTH, height: MINING_CONFIG.GRID_HEIGHT };
}
