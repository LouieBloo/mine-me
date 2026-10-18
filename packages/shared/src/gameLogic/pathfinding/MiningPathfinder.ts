import {
  getTileMaxHealth,
  isTileClimbable,
  isTileMineable,
  isTileSolid,
  type MiningPathWaypoint,
  type MiningPosition,
} from '../../types/mining';
import type { MiningCollisionGrid } from '../../physics/MiningPhysicsBody';
import { getGridDimensions } from '../../physics/gridDimensions';
import { MinHeap } from '../../utils/MinHeap';

export interface MiningPathfinderOptions {
  /** Whether the entity can mine through solid destructible blocks */
  canMine?: boolean;
  /** Maximum vertical jump height in tile units (default 2) */
  maxJumpTiles?: number;
  /** Whether entity can climb ladders (default true) */
  canClimbLadders?: boolean;
  /** Maximum number of node evaluations before aborting */
  maxSearchDepth?: number;
  /**
   * How many cells wide and tall the body is (default 1 x 1). A path node is then the body's footprint: its left
   * column `x` and its bottom row `y` (the row the feet are in); the footprint covers columns `x .. x + width - 1`
   * and rows `y - height + 1 .. y`, and every move needs the whole footprint to be free.
   */
  bodyWidth?: number;
  bodyHeight?: number;
}

/** The whole cells a body of this size (in tiles) needs: a body 1.9 wide and 2.67 tall needs 2 x 3 cells. */
export function footprintOf(width: number, height: number): { width: number; height: number } {
  return { width: Math.max(1, Math.ceil(width - 0.05)), height: Math.max(1, Math.ceil(height - 0.05)) };
}

interface PathNode {
  x: number;
  y: number;
  g: number;
  h: number;
  f: number;
  action: MiningPathWaypoint['action'];
}

/**
 * A* Pathfinding engine designed for 2D platformer mining caverns.
 * Considers walking, stepping up, jumping over ledges and gaps, falling, ladder climbing,
 * and weighted excavation through mineable blocks when paths are blocked.
 * Works for bodies bigger than one cell: see `bodyWidth` / `bodyHeight`.
 */
export class MiningPathfinder {
  public static findPath(
    start: MiningPosition,
    target: MiningPosition,
    grid: MiningCollisionGrid,
    options?: MiningPathfinderOptions
  ): MiningPathWaypoint[] {
    const { width: gridWidth, height: gridHeight } = getGridDimensions(grid);
    const canMine = options?.canMine ?? true;
    const maxJumpTiles = Math.max(1, Math.floor(options?.maxJumpTiles ?? 2));
    const canClimbLadders = options?.canClimbLadders ?? true;
    const maxSearchDepth = options?.maxSearchDepth ?? 600;
    const fw = Math.max(1, Math.floor(options?.bodyWidth ?? 1));
    const fh = Math.max(1, Math.floor(options?.bodyHeight ?? 1));

    const checkSolid = (x: number, y: number): boolean => {
      if (x < 0 || x >= gridWidth) return true;
      if (y >= gridHeight) return true;
      if (y < 0) return false;
      const row = grid[y];
      const tile = row ? row[x] : undefined;
      return tile ? isTileSolid(tile.type) : false;
    };

    const isSolid = checkSolid;

    const isClimbable = (x: number, y: number): boolean => {
      if (x < 0 || x >= gridWidth || y < 0 || y >= gridHeight) {
        return false;
      }
      const row = grid[y];
      const tile = row ? row[x] : undefined;
      return tile ? isTileClimbable(tile.type) : false;
    };

    const isMineable = (x: number, y: number): boolean => {
      if (x < 0 || x >= gridWidth || y < 0 || y >= gridHeight) {
        return false;
      }
      const row = grid[y];
      const tile = row ? row[x] : undefined;
      return tile ? isTileMineable(tile.type) : false;
    };

    const getMineCost = (x: number, y: number): number => {
      const row = grid[y];
      const tile = row ? row[x] : undefined;
      if (!tile) return 1.0;
      const health = getTileMaxHealth(tile.type);
      return 1.0 + health / 100;
    };

    // ---- The body's footprint at node (x, y): columns x .. x+fw-1, rows y-fh+1 .. y ----

    /** Whether any solid cell lies in the footprint at (x, y). */
    const blocked = (x: number, y: number): boolean => {
      for (let r = y - fh + 1; r <= y; r++) for (let c = x; c < x + fw; c++) if (checkSolid(c, r)) return true;
      return false;
    };
    /** The solid cells in the footprint at (x, y), when every one of them can be mined; null if any cannot. */
    const solidCellsIfMineable = (x: number, y: number): MiningPosition[] | null => {
      const cells: MiningPosition[] = [];
      for (let r = y - fh + 1; r <= y; r++) {
        for (let c = x; c < x + fw; c++) {
          if (!checkSolid(c, r)) continue;
          if (!isMineable(c, r)) return null;
          cells.push({ x: c, y: r });
        }
      }
      return cells;
    };
    /** Whether the body at (x, y) stands on something: solid ground under any column, or a climbable cell in it. */
    const supported = (x: number, y: number): boolean => {
      if (y + 1 >= gridHeight) return true;
      for (let c = x; c < x + fw; c++) if (isSolid(c, y + 1)) return true;
      return climbableAt(x, y);
    };
    const climbableAt = (x: number, y: number): boolean => {
      for (let r = y - fh + 1; r <= y; r++) for (let c = x; c < x + fw; c++) if (isClimbable(c, r)) return true;
      return false;
    };

    let sx = Math.max(0, Math.min(gridWidth - fw, Math.floor(start.x)));
    let sy = Math.max(0, Math.min(gridHeight - 1, Math.floor(start.y)));
    let gx = Math.max(0, Math.min(gridWidth - fw, Math.floor(target.x)));
    let gy = Math.max(0, Math.min(gridHeight - 1, Math.floor(target.y)));

    // Ensure start node is not accidentally snapped into solid floor
    if (blocked(sx, sy) && sy > 0 && !blocked(sx, sy - 1)) {
      sy--;
    }
    // Ensure goal node is not inside solid floor
    if (blocked(gx, gy) && gy > 0 && !blocked(gx, gy - 1)) {
      gy--;
    }

    if (sx === gx && sy === gy) {
      return [];
    }

    // Cells are keyed by a single number (no string building in the hot loop)
    const key = (x: number, y: number) => y * gridWidth + x;
    const heuristic = (x: number, y: number) => Math.abs(x - gx) + Math.abs(y - gy);

    // Open set: a binary heap with lazy deletion (a better route to a cell pushes a fresh entry;
    // the stale one is skipped when it surfaces).
    const openSet = new MinHeap<PathNode>();
    const closedSet = new Set<number>();

    const cameFrom = new Map<number, { parentKey: number; waypoint: MiningPathWaypoint }>();
    const gScores = new Map<number, number>();

    const startNode: PathNode = {
      x: sx,
      y: sy,
      g: 0,
      h: heuristic(sx, sy),
      f: heuristic(sx, sy),
      action: 'WALK',
    };

    openSet.push(startNode, startNode.f);
    gScores.set(key(sx, sy), 0);

    let closestNode: PathNode = startNode;
    let iterations = 0;

    while (openSet.size > 0 && iterations < maxSearchDepth) {
      // Pop lowest f score, skipping entries made stale by a better route or already expanded
      const current = openSet.pop()!;
      const currentKey = key(current.x, current.y);
      if (closedSet.has(currentKey) || current.g > (gScores.get(currentKey) ?? Infinity)) continue;
      iterations++;
      closedSet.add(currentKey);

      // Track closest node to target
      if (current.h < closestNode.h) {
        closestNode = current;
      }

      // Reached goal
      if (current.x === gx && current.y === gy) {
        return MiningPathfinder.reconstructPath(cameFrom, currentKey);
      }

      const isSupportedHere = supported(current.x, current.y);
      const onLadder = climbableAt(current.x, current.y);

      // Candidate neighbor transitions: { x, y, cost, action }
      const neighbors: Array<{ x: number; y: number; cost: number; action: MiningPathWaypoint['action']; mineTarget?: MiningPosition }> = [];

      // The cheapest-to-start solid cell of a set to dig out first: the one nearest the middle of the body
      const firstToMine = (cells: MiningPosition[], fromX: number, fromY: number): MiningPosition => {
        const cx = fromX + fw / 2;
        const cy = fromY - fh / 2 + 0.5;
        let best = cells[0];
        let bestDist = Infinity;
        for (const cell of cells) {
          const d = Math.hypot(cell.x + 0.5 - cx, cell.y + 0.5 - cy);
          if (d < bestDist) { best = cell; bestDist = d; }
        }
        return best;
      };
      const mineCostOf = (cells: MiningPosition[]) => cells.reduce((sum, c) => sum + getMineCost(c.x, c.y), 0);

      // 1. Horizontal Movement (Left / Right)
      for (const dx of [-1, 1]) {
        const nx = current.x + dx;
        const ny = current.y;
        if (nx < 0 || nx + fw > gridWidth) continue;

        if (!blocked(nx, ny)) {
          // Empty space
          if (supported(nx, ny)) {
            neighbors.push({ x: nx, y: ny, cost: 1.0, action: 'WALK' });
          } else {
            // Ledge step-off / fall
            neighbors.push({ x: nx, y: ny, cost: 1.2, action: 'FALL' });
          }
        } else {
          // A one-cell ledge in the way is stepped up onto, without a jump (bodies taller than one cell)
          if (fh > 1 && isSupportedHere && ny - 1 >= 0 && !blocked(nx, ny - 1) && !blocked(current.x, ny - 1) && supported(nx, ny - 1)) {
            neighbors.push({ x: nx, y: ny - 1, cost: 1.3, action: 'WALK' });
          }
          if (canMine) {
            const cells = solidCellsIfMineable(nx, ny);
            if (cells && cells.length > 0) {
              neighbors.push({ x: nx, y: ny, cost: mineCostOf(cells), action: 'MINE', mineTarget: firstToMine(cells, nx, ny) });
            }
          }
        }
      }

      // 2. Jumping (If supported on solid ground and not on a ladder)
      if (isSupportedHere && !onLadder) {
        // Vertical jump up 1 tile
        const up1Y = current.y - 1;
        if (up1Y >= 0) {
          if (!blocked(current.x, up1Y)) {
            neighbors.push({ x: current.x, y: up1Y, cost: 1.4, action: 'JUMP' });
          } else if (canMine) {
            const cells = solidCellsIfMineable(current.x, up1Y);
            if (cells && cells.length > 0) {
              neighbors.push({ x: current.x, y: up1Y, cost: 0.5 + mineCostOf(cells), action: 'MINE', mineTarget: firstToMine(cells, current.x, up1Y) });
            }
          }
        }

        // Vertical jump up 2 .. maxJumpTiles tiles (each cell in between must be free)
        for (let k = 2; k <= maxJumpTiles; k++) {
          const upY = current.y - k;
          if (upY < 0) break;
          if (blocked(current.x, current.y - k + 1) || blocked(current.x, upY)) break;
          neighbors.push({ x: current.x, y: upY, cost: 1.9 + 0.5 * (k - 2), action: 'JUMP' });
        }

        // Diagonal jump onto an elevated ledge: (current.x ± 1, current.y - k)
        for (const dx of [-1, 1]) {
          const dnx = current.x + dx;
          if (dnx < 0 || dnx + fw > gridWidth) continue;
          for (let k = 1; k <= (fh > 1 ? maxJumpTiles : 1); k++) {
            const dny = current.y - k;
            if (dny < 0) break;
            // Headroom check: the body must be able to rise to this height, and be free at the landing
            if (blocked(current.x, dny)) break;
            if (!blocked(dnx, dny) && supported(dnx, dny)) {
              neighbors.push({ x: dnx, y: dny, cost: 1.6 + 0.3 * (k - 1), action: 'JUMP' });
            }
          }
        }

        // Jump over a pit: (current.x ± (fw + 1), current.y) - only if the cells between are an actual gap/pit
        for (const sign of [-1, 1]) {
          const landX = current.x + sign * (fw + 1);
          if (landX < 0 || landX + fw > gridWidth) continue;
          let isPit = false;
          let clear = true;
          for (let step = 1; step <= fw; step++) {
            const midX = current.x + sign * step;
            if (blocked(midX, current.y)) { clear = false; break; }
            if (!supported(midX, current.y)) isPit = true;
          }
          if (clear && isPit && !blocked(landX, current.y) && supported(landX, current.y)) {
            neighbors.push({ x: landX, y: current.y, cost: 2.1, action: 'JUMP' });
          }
        }
      }

      // 3. Falling / Downward Movement
      const downY = current.y + 1;
      if (downY < gridHeight) {
        if (!blocked(current.x, downY)) {
          neighbors.push({ x: current.x, y: downY, cost: 1.0, action: 'FALL' });
        } else if (canMine) {
          const cells = solidCellsIfMineable(current.x, downY);
          if (cells && cells.length > 0) {
            neighbors.push({ x: current.x, y: downY, cost: 0.3 + mineCostOf(cells), action: 'MINE', mineTarget: firstToMine(cells, current.x, downY) });
          }
        }
      }

      // 4. Ladder Climbing
      if (canClimbLadders) {
        if (onLadder || (current.y - 1 >= 0 && climbableAt(current.x, current.y - 1))) {
          const climbUpY = current.y - 1;
          if (climbUpY >= 0 && !blocked(current.x, climbUpY)) {
            neighbors.push({ x: current.x, y: climbUpY, cost: 1.1, action: 'CLIMB' });
          }
        }
        if (onLadder || (downY < gridHeight && climbableAt(current.x, downY))) {
          if (downY < gridHeight && !blocked(current.x, downY)) {
            neighbors.push({ x: current.x, y: downY, cost: 1.1, action: 'CLIMB' });
          }
        }
      }

      // Process valid neighbors
      for (const n of neighbors) {
        const nKey = key(n.x, n.y);
        if (closedSet.has(nKey)) continue;

        const tentativeG = current.g + n.cost;
        const currentBestG = gScores.get(nKey);

        if (currentBestG === undefined || tentativeG < currentBestG) {
          gScores.set(nKey, tentativeG);
          const h = heuristic(n.x, n.y);
          const nextNode: PathNode = {
            x: n.x,
            y: n.y,
            g: tentativeG,
            h,
            f: tentativeG + h,
            action: n.action,
          };

          cameFrom.set(nKey, {
            parentKey: currentKey,
            waypoint: n.mineTarget ? { x: n.x, y: n.y, action: n.action, mineTarget: n.mineTarget } : { x: n.x, y: n.y, action: n.action },
          });

          openSet.push(nextNode, nextNode.f);
        }
      }
    }

    // If target was unreachable within max iterations, return path to best closest node
    return MiningPathfinder.reconstructPath(cameFrom, key(closestNode.x, closestNode.y));
  }

  private static reconstructPath(
    cameFrom: Map<number, { parentKey: number; waypoint: MiningPathWaypoint }>,
    endKey: number
  ): MiningPathWaypoint[] {
    const path: MiningPathWaypoint[] = [];
    let curr = endKey;

    while (cameFrom.has(curr)) {
      const step = cameFrom.get(curr)!;
      path.unshift(step.waypoint);
      curr = step.parentKey;
    }

    return path;
  }
}
