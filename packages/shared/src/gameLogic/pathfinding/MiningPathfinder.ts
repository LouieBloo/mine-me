import {
  MINING_CONFIG,
  getTileMaxHealth,
  isTileClimbable,
  isTileMineable,
  isTileSolid,
  type MiningPathWaypoint,
  type MiningPosition,
} from '../../types/mining';
import type { MiningCollisionGrid } from '../../physics/MiningPhysicsBody';

export interface MiningPathfinderOptions {
  /** Whether the entity can mine through solid destructible blocks */
  canMine?: boolean;
  /** Maximum vertical jump height in tile units (default 2) */
  maxJumpTiles?: number;
  /** Whether entity can climb ladders (default true) */
  canClimbLadders?: boolean;
  /** Maximum number of node evaluations before aborting */
  maxSearchDepth?: number;
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
 * Considers walking, jumping over ledges and gaps, falling, ladder climbing,
 * and weighted excavation through mineable blocks when paths are blocked.
 */
export class MiningPathfinder {
  public static findPath(
    start: MiningPosition,
    target: MiningPosition,
    grid: MiningCollisionGrid,
    options?: MiningPathfinderOptions
  ): MiningPathWaypoint[] {
    const canMine = options?.canMine ?? true;
    const maxJumpTiles = options?.maxJumpTiles ?? 2;
    const canClimbLadders = options?.canClimbLadders ?? true;
    const maxSearchDepth = options?.maxSearchDepth ?? 600;

    const checkSolid = (x: number, y: number): boolean => {
      if (x < 0 || x >= MINING_CONFIG.GRID_WIDTH) return true;
      if (y >= MINING_CONFIG.GRID_HEIGHT) return true;
      if (y < 0) return false;
      const row = grid[y];
      const tile = row ? row[x] : undefined;
      return tile ? isTileSolid(tile.type as any) : false;
    };

    let sx = Math.max(0, Math.min(MINING_CONFIG.GRID_WIDTH - 1, Math.floor(start.x)));
    let sy = Math.max(0, Math.min(MINING_CONFIG.GRID_HEIGHT - 1, Math.floor(start.y)));
    let gx = Math.max(0, Math.min(MINING_CONFIG.GRID_WIDTH - 1, Math.floor(target.x)));
    let gy = Math.max(0, Math.min(MINING_CONFIG.GRID_HEIGHT - 1, Math.floor(target.y)));

    // Ensure start node is not accidentally snapped into solid floor
    if (checkSolid(sx, sy) && sy > 0 && !checkSolid(sx, sy - 1)) {
      sy--;
    }
    // Ensure goal node is not inside solid floor
    if (checkSolid(gx, gy) && gy > 0 && !checkSolid(gx, gy - 1)) {
      gy--;
    }

    if (sx === gx && sy === gy) {
      return [];
    }

    const key = (x: number, y: number) => `${x},${y}`;
    const heuristic = (x: number, y: number) => Math.abs(x - gx) + Math.abs(y - gy);

    // Min-Priority Queue for open set
    const openSet: PathNode[] = [];
    const openMap = new Map<string, PathNode>();
    const closedSet = new Set<string>();

    const cameFrom = new Map<string, { parentKey: string; waypoint: MiningPathWaypoint }>();
    const gScores = new Map<string, number>();

    const startNode: PathNode = {
      x: sx,
      y: sy,
      g: 0,
      h: heuristic(sx, sy),
      f: heuristic(sx, sy),
      action: 'WALK',
    };

    openSet.push(startNode);
    openMap.set(key(sx, sy), startNode);
    gScores.set(key(sx, sy), 0);

    let closestNode: PathNode = startNode;
    let iterations = 0;

    const isSolid = (x: number, y: number): boolean => {
      if (x < 0 || x >= MINING_CONFIG.GRID_WIDTH) return true;
      if (y >= MINING_CONFIG.GRID_HEIGHT) return true;
      if (y < 0) return false;
      const row = grid[y];
      const tile = row ? row[x] : undefined;
      return tile ? isTileSolid(tile.type as any) : false;
    };

    const isClimbable = (x: number, y: number): boolean => {
      if (x < 0 || x >= MINING_CONFIG.GRID_WIDTH || y < 0 || y >= MINING_CONFIG.GRID_HEIGHT) {
        return false;
      }
      const row = grid[y];
      const tile = row ? row[x] : undefined;
      return tile ? isTileClimbable(tile.type as any) : false;
    };

    const isMineable = (x: number, y: number): boolean => {
      if (x < 0 || x >= MINING_CONFIG.GRID_WIDTH || y < 0 || y >= MINING_CONFIG.GRID_HEIGHT) {
        return false;
      }
      const row = grid[y];
      const tile = row ? row[x] : undefined;
      return tile ? isTileMineable(tile.type as any) : false;
    };

    const getMineCost = (x: number, y: number): number => {
      const row = grid[y];
      const tile = row ? row[x] : undefined;
      if (!tile) return 1.0;
      const health = getTileMaxHealth(tile.type as any);
      return 1.0 + health / 100;
    };

    const isSupported = (x: number, y: number): boolean => {
      return y + 1 >= MINING_CONFIG.GRID_HEIGHT || isSolid(x, y + 1) || isClimbable(x, y);
    };

    while (openSet.length > 0 && iterations < maxSearchDepth) {
      iterations++;

      // Pop lowest f score
      openSet.sort((a, b) => a.f - b.f);
      const current = openSet.shift()!;
      const currentKey = key(current.x, current.y);
      openMap.delete(currentKey);
      closedSet.add(currentKey);

      // Track closest node to target
      if (current.h < closestNode.h) {
        closestNode = current;
      }

      // Reached goal
      if (current.x === gx && current.y === gy) {
        return MiningPathfinder.reconstructPath(cameFrom, currentKey);
      }

      const supported = isSupported(current.x, current.y);
      const onLadder = isClimbable(current.x, current.y);

      // Candidate neighbor transitions: { x, y, cost, action }
      const neighbors: Array<{ x: number; y: number; cost: number; action: MiningPathWaypoint['action'] }> = [];

      // 1. Horizontal Movement (Left / Right)
      for (const dx of [-1, 1]) {
        const nx = current.x + dx;
        const ny = current.y;
        if (nx < 0 || nx >= MINING_CONFIG.GRID_WIDTH) continue;

        if (!isSolid(nx, ny)) {
          // Empty space
          if (isSupported(nx, ny)) {
            neighbors.push({ x: nx, y: ny, cost: 1.0, action: 'WALK' });
          } else {
            // Ledge step-off / fall
            neighbors.push({ x: nx, y: ny, cost: 1.2, action: 'FALL' });
          }
        } else if (canMine && isMineable(nx, ny)) {
          neighbors.push({ x: nx, y: ny, cost: getMineCost(nx, ny), action: 'MINE' });
        }
      }

      // 2. Jumping (If supported on solid ground and not on a ladder)
      if (supported && !onLadder) {
        // Vertical jump up 1 tile
        const up1Y = current.y - 1;
        if (up1Y >= 0) {
          if (!isSolid(current.x, up1Y)) {
            neighbors.push({ x: current.x, y: up1Y, cost: 1.4, action: 'JUMP' });
          } else if (canMine && isMineable(current.x, up1Y)) {
            neighbors.push({ x: current.x, y: up1Y, cost: 1.5 + getMineCost(current.x, up1Y), action: 'MINE' });
          }
        }

        // Vertical jump up 2 tiles
        if (maxJumpTiles >= 2) {
          const up2Y = current.y - 2;
          if (up2Y >= 0 && !isSolid(current.x, up1Y) && !isSolid(current.x, up2Y)) {
            neighbors.push({ x: current.x, y: up2Y, cost: 1.9, action: 'JUMP' });
          }
        }

        // Diagonal jump onto an elevated ledge: (current.x ± 1, current.y - 1)
        for (const dx of [-1, 1]) {
          const dnx = current.x + dx;
          const dny = current.y - 1;
          if (dnx >= 0 && dnx < MINING_CONFIG.GRID_WIDTH && dny >= 0) {
            // Headroom check
            if (!isSolid(current.x, dny) && !isSolid(dnx, dny) && isSupported(dnx, dny)) {
              neighbors.push({ x: dnx, y: dny, cost: 1.6, action: 'JUMP' });
            }
          }
        }

        // Jump over 1-tile pit: (current.x ± 2, current.y) - only if mid tile is an actual gap/pit
        for (const dx of [-2, 2]) {
          const pitMidX = current.x + dx / 2;
          const landX = current.x + dx;
          if (landX >= 0 && landX < MINING_CONFIG.GRID_WIDTH) {
            // Mid tile must be open air with no floor underneath (a real pit)
            const isMidPit = !isSolid(pitMidX, current.y) && !isSolid(pitMidX, current.y + 1);
            if (isMidPit && !isSolid(landX, current.y) && isSupported(landX, current.y)) {
              neighbors.push({ x: landX, y: current.y, cost: 2.1, action: 'JUMP' });
            }
          }
        }
      }

      // 3. Falling / Downward Movement
      const downY = current.y + 1;
      if (downY < MINING_CONFIG.GRID_HEIGHT) {
        if (!isSolid(current.x, downY)) {
          neighbors.push({ x: current.x, y: downY, cost: 1.0, action: 'FALL' });
        } else if (canMine && isMineable(current.x, downY)) {
          neighbors.push({ x: current.x, y: downY, cost: 1.3 + getMineCost(current.x, downY), action: 'MINE' });
        }
      }

      // 4. Ladder Climbing
      if (canClimbLadders) {
        if (onLadder || (current.y - 1 >= 0 && isClimbable(current.x, current.y - 1))) {
          const climbUpY = current.y - 1;
          if (climbUpY >= 0 && !isSolid(current.x, climbUpY)) {
            neighbors.push({ x: current.x, y: climbUpY, cost: 1.1, action: 'CLIMB' });
          }
        }
        if (onLadder || (downY < MINING_CONFIG.GRID_HEIGHT && isClimbable(current.x, downY))) {
          if (downY < MINING_CONFIG.GRID_HEIGHT && !isSolid(current.x, downY)) {
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
            waypoint: { x: n.x, y: n.y, action: n.action },
          });

          const existingOpen = openMap.get(nKey);
          if (existingOpen) {
            existingOpen.g = tentativeG;
            existingOpen.f = tentativeG + h;
            existingOpen.action = n.action;
          } else {
            openSet.push(nextNode);
            openMap.set(nKey, nextNode);
          }
        }
      }
    }

    // If target was unreachable within max iterations, return path to best closest node
    return MiningPathfinder.reconstructPath(cameFrom, key(closestNode.x, closestNode.y));
  }

  private static reconstructPath(
    cameFrom: Map<string, { parentKey: string; waypoint: MiningPathWaypoint }>,
    endKey: string
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
