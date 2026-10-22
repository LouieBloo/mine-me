import { BaseMobAI, type MobAIContext, type MobActionIntent, type PlayerTargetInfo } from './BaseMobAI';
import { MiningPathfinder, footprintOf } from '../pathfinding/MiningPathfinder';
import { isTileMineable, isTileSolid, BLOCK_SCALE, MINING_CONFIG, type MiningPathWaypoint } from '../../types/mining';

const MIN_PATH_INTERVAL = 1.0;
const PATH_INTERVAL_JITTER = 0.5;

/** Stable pseudo-random number in [0, 1) derived from a string. */
function hashToUnit(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000;
}

/**
 * Intelligent Mob AI behavior that chases player characters through the cavern.
 * Navigates tunnels, leaps across platforms/gaps, climbs ladders, and excavates
 * obstructing blocks when direct paths are blocked.
 */
export class ChaseAndMineAI extends BaseMobAI {
  private path: MiningPathWaypoint[] = [];
  private pathTimer: number = 0;
  private currentWaypointIndex: number = 0;
  private lastTargetPos: { x: number; y: number } | null = null;
  /** Seconds between periodic re-paths; differs a little per mob so a crowd doesn't re-path on the same tick. */
  private readonly pathInterval: number;

  constructor(mobId: string, instanceId: string) {
    super(mobId, instanceId);
    this.pathInterval = MIN_PATH_INTERVAL + hashToUnit(instanceId) * PATH_INTERVAL_JITTER;
  }

  public update(dt: number, context: MobAIContext): MobActionIntent {
    this.pathTimer = Math.max(0, this.pathTimer - dt);

    const aggroRange = context.config?.aggroRange ?? MINING_CONFIG.MOB_DEFAULT_AGGRO_RANGE;
    const attackRange = context.config?.attackRange ?? MINING_CONFIG.MOB_DEFAULT_ATTACK_RANGE;
    const canMine = context.config?.canMine ?? true;
    const mineRange = context.config?.mineRange ?? MINING_CONFIG.MOB_DEFAULT_MINE_RANGE;
    const maxJumpTiles = context.config?.maxJumpTiles ?? Math.max(1, Math.floor(context.jumpTiles ?? 1));

    // A mob with a body size is planned for as a block of cells (a footprint); without, as the one cell it stands in
    const bodyMode = context.body !== undefined;
    const fp = context.body ? footprintOf(context.body.width, context.body.height) : { width: 1, height: 1 };
    const halfHeight = context.body ? context.body.height / 2 : 0;
    const playerHalfHeight = MINING_CONFIG.PLAYER_COLLIDER_HEIGHT_TILES / 2;
    /** The footprint node (left column, bottom row) a body centred at `p` occupies. */
    const nodeOf = (p: { x: number; y: number }, half: number): { x: number; y: number } =>
      bodyMode
        ? { x: Math.round(p.x - fp.width / 2), y: Math.floor(p.y + half - 0.001) }
        : { x: Math.floor(p.x), y: Math.floor(p.y) };
    const isObstacle = (tx: number, ty: number): boolean => {
      const row = context.grid[ty];
      const tile = row ? row[tx] : undefined;
      return tile ? isTileSolid(tile.type) : false;
    };
    /** Whether any cell of the footprint at node (nx, ny) is solid. */
    const footprintBlocked = (nx: number, ny: number): boolean => {
      for (let r = ny - fp.height + 1; r <= ny; r++) for (let c = nx; c < nx + fp.width; c++) if (isObstacle(c, r)) return true;
      return false;
    };
    /** Whether the cell is a solid block this mob can actually break (a rock, or an ore harder than its pick, is a wall to it). */
    const isDiggable = (tx: number, ty: number): boolean => {
      if (!isObstacle(tx, ty)) return false;
      const tile = context.grid[ty]?.[tx];
      return !tile || (isTileMineable(tile.type) && (context.canBreakTile?.(tile.type) ?? true));
    };
    /** The solid cell of the footprint at a waypoint to dig next: the one the pathfinder chose if it is still there, else the nearest. */
    const cellToMine = (wp: MiningPathWaypoint): { x: number; y: number } | null => {
      if (!bodyMode) return isDiggable(wp.x, wp.y) ? { x: wp.x, y: wp.y } : null;
      if (wp.mineTarget && isDiggable(wp.mineTarget.x, wp.mineTarget.y)) return wp.mineTarget;
      let best: { x: number; y: number } | null = null;
      let bestDist = Infinity;
      for (let r = wp.y - fp.height + 1; r <= wp.y; r++) {
        for (let c = wp.x; c < wp.x + fp.width; c++) {
          if (!isDiggable(c, r)) continue;
          const d = Math.hypot(c + 0.5 - context.position.x, r + 0.5 - context.position.y);
          if (d < bestDist) { best = { x: c, y: r }; bestDist = d; }
        }
      }
      return best;
    };
    /** The world x a body should walk to to stand on waypoint `wp`: the middle of its footprint. */
    const centreX = (wp: { x: number }): number => wp.x + (bodyMode ? fp.width / 2 : 0.5);
    /**
     * Steering that settles on the middle of the footprint instead of stopping short of it: full speed until the last
     * half cell, then slower in proportion to how far is left. A body only a hair narrower than its footprint (the mole
     * is 1.9 cells in 2) that stops 0.1 short still overhangs the next column, so it keeps resting on a ledge edge it
     * meant to step off and bumps its head on a ceiling its footprint says is clear.
     */
    const steer = (wp: { x: number }): number => {
      const diff = centreX(wp) - context.position.x;
      if (!bodyMode) return Math.sign(diff);
      if (Math.abs(diff) < 0.01) return 0;
      return Math.abs(diff) >= 0.5 ? Math.sign(diff) : Math.max(-1, Math.min(1, diff * 2.5));
    };
    /** Whether the body is lined up with the middle of the footprint at waypoint `wp` (close enough not to overhang its neighbours). */
    const alignedWith = (wp: { x: number }): boolean => !bodyMode || Math.abs(centreX(wp) - context.position.x) < 0.04;

    // 1. Locate nearest living player
    let nearestPlayer: PlayerTargetInfo | null = null;
    let shortestDist = Infinity;

    for (const player of context.players) {
      if (player.health <= 0) continue;
      const dx = player.position.x - context.position.x;
      const dy = player.position.y - context.position.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < shortestDist) {
        shortestDist = dist;
        nearestPlayer = player;
      }
    }

    // Default neutral intent
    const defaultIntent: MobActionIntent = {
      moveX: 0,
      jump: false,
      climbUp: false,
      climbDown: false,
      isMining: false,
      miningTarget: null,
      isAttacking: false,
      animationState: 'idle',
    };

    if (!nearestPlayer || shortestDist > aggroRange) {
      this.path = [];
      return defaultIntent;
    }

    const dx = nearestPlayer.position.x - context.position.x;

    // 2. In Melee Attack Range
    if (shortestDist <= attackRange) {
      this.path = [];
      // Always report the target in reach; how often it actually swings is the swing timer's job
      // (the same Mining Speed rate players use), not the AI's.
      return {
        moveX: 0,
        jump: false,
        climbUp: false,
        climbDown: false,
        isMining: false,
        miningTarget: null,
        isAttacking: true,
        attackTargetId: nearestPlayer.characterId,
        animationState: 'attack',
      };
    }

    // Helper to check if a tile is currently solid
    const isTileObstacle = isObstacle;

    // 3. Path Recalculation
    const targetTile = bodyMode
      ? nodeOf(nearestPlayer.position, playerHalfHeight)
      : { x: Math.floor(nearestPlayer.position.x), y: Math.floor(nearestPlayer.position.y) };
    const mobNode = nodeOf(context.position, halfHeight);

    const currentWpAtIdx = this.path[this.currentWaypointIndex];
    const activeMineCell = currentWpAtIdx?.action === 'MINE' ? cellToMine(currentWpAtIdx) : null;
    const isActivelyMining =
      activeMineCell !== null && BaseMobAI.isWithinReach(context.position, activeMineCell, mineRange);

    const targetMoved =
      !this.lastTargetPos ||
      Math.abs(this.lastTargetPos.x - targetTile.x) > 1.5 * BLOCK_SCALE ||
      Math.abs(this.lastTargetPos.y - targetTile.y) > 1.5 * BLOCK_SCALE;

    // Do not interrupt an active block excavation on the periodic timer
    const needsPath = this.pathTimer <= 0 || targetMoved || this.currentWaypointIndex >= this.path.length;
    // Over the tick's search budget: keep the current path and ask again next tick
    if (!isActivelyMining && needsPath && (context.pathBudget?.tryConsume() ?? true)) {
      this.path = MiningPathfinder.findPath(
        bodyMode ? { x: mobNode.x + 0.5, y: mobNode.y + 0.5 } : { x: context.position.x, y: context.position.y },
        bodyMode ? { x: targetTile.x + 0.5, y: targetTile.y + 0.5 } : targetTile,
        context.grid,
        { canMine, canBreakTile: context.canBreakTile, maxJumpReach: context.jumpReach, maxJumpTiles, bodyWidth: fp.width, bodyHeight: fp.height, maxSearchDepth: 500 * BLOCK_SCALE }
      );
      this.currentWaypointIndex = 0;
      this.pathTimer = this.pathInterval;
      this.lastTargetPos = targetTile;
    }

    // If the current waypoint was a MINE action and the block is now excavated (EMPTY), advance!
    while (
      this.currentWaypointIndex < this.path.length &&
      this.path[this.currentWaypointIndex].action === 'MINE' &&
      cellToMine(this.path[this.currentWaypointIndex]) === null
    ) {
      this.currentWaypointIndex++;
    }

    // If no path could be found or path is exhausted, attempt direct approach towards target
    if (this.path.length === 0 || this.currentWaypointIndex >= this.path.length) {
      if (bodyMode) {
        const dir = Math.sign(dx);
        const ahead = mobNode.x + dir;
        const blockedAhead = dir !== 0 && footprintBlocked(ahead, mobNode.y);
        // A one-cell step is walked up; a higher obstacle is jumped if the body fits through the air above it
        if (context.isGrounded && blockedAhead && footprintBlocked(ahead, mobNode.y - 1)) {
          for (let k = 2; k <= maxJumpTiles; k++) {
            if (!footprintBlocked(ahead, mobNode.y - k) && !footprintBlocked(mobNode.x, mobNode.y - k)) {
              return { moveX: dir, jump: true, climbUp: false, climbDown: false, isMining: false, miningTarget: null, isAttacking: false, animationState: 'jump' };
            }
          }
        }
        if (canMine && blockedAhead) {
          const cell = cellToMine({ x: ahead, y: mobNode.y, action: 'MINE' });
          if (cell && BaseMobAI.isWithinReach(context.position, cell, mineRange)) {
            return { moveX: 0, jump: false, climbUp: false, climbDown: false, isMining: true, miningTarget: cell, isAttacking: false, animationState: 'mine' };
          }
        }
        return { moveX: dir, jump: false, climbUp: false, climbDown: false, isMining: false, miningTarget: null, isAttacking: false, animationState: Math.abs(dx) > 0.1 ? 'walk' : 'idle' };
      }
      const dirX = Math.sign(dx);
      const nextTileX = Math.floor(context.position.x + dirX * 0.6 * BLOCK_SCALE);
      const currentTileY = Math.floor(context.position.y);
      const headTileY = currentTileY - 1;
      const isObstacleAhead = isTileObstacle(nextTileX, currentTileY);
      const hasClearanceAboveObstacle = !isTileObstacle(nextTileX, headTileY);
      const hasClearanceAboveHead = !isTileObstacle(Math.floor(context.position.x), headTileY);

      // If grounded and facing a 1-tile block with headroom, jump over it
      if (context.isGrounded && dirX !== 0 && isObstacleAhead && hasClearanceAboveObstacle && hasClearanceAboveHead) {
        return {
          moveX: dirX,
          jump: true,
          climbUp: false,
          climbDown: false,
          isMining: false,
          miningTarget: null,
          isAttacking: false,
          animationState: 'jump',
        };
      }

      if (canMine && isObstacleAhead) {
        const inReach = BaseMobAI.isWithinReach(context.position, { x: nextTileX, y: currentTileY }, mineRange);
        if (inReach) {
          return {
            moveX: 0,
            jump: false,
            climbUp: false,
            climbDown: false,
            isMining: true,
            miningTarget: { x: nextTileX, y: currentTileY },
            isAttacking: false,
            animationState: 'mine',
          };
        }
      }
      return {
        moveX: dirX,
        jump: false,
        climbUp: false,
        climbDown: false,
        isMining: false,
        miningTarget: null,
        isAttacking: false,
        animationState: Math.abs(dx) > 0.1 ? 'walk' : 'idle',
      };
    }

    // 4. Follow Waypoint
    let wp = this.path[this.currentWaypointIndex];

    const mobTileX = bodyMode ? mobNode.x : Math.floor(context.position.x);
    const mobTileY = bodyMode ? mobNode.y : Math.floor(context.position.y);

    // For non-MINE waypoints, advance once mob reaches the tile
    if (wp.action !== 'MINE') {
      const reached = mobTileX === wp.x && Math.abs(mobTileY - wp.y) <= 1;
      if (reached) {
        this.currentWaypointIndex++;
        if (this.currentWaypointIndex >= this.path.length) {
          return defaultIntent;
        }
        wp = this.path[this.currentWaypointIndex];
      }
    }

    const currentWp = wp;

    switch (currentWp.action) {
      case 'MINE': {
        const mineCell = cellToMine(currentWp) ?? { x: currentWp.x, y: currentWp.y };
        const inReach = BaseMobAI.isWithinReach(context.position, mineCell, mineRange);
        if (!inReach) {
          // Walk towards the block until within mining reach
          const moveDir = steer(currentWp);
          return {
            moveX: moveDir,
            jump: false,
            climbUp: false,
            climbDown: false,
            isMining: false,
            miningTarget: null,
            isAttacking: false,
            animationState: 'walk',
          };
        }

        return {
          moveX: 0,
          jump: false,
          climbUp: false,
          climbDown: false,
          isMining: true,
          miningTarget: { x: mineCell.x, y: mineCell.y },
          isAttacking: false,
          animationState: 'mine',
        };
      }

      case 'JUMP':
        return {
          moveX: steer(currentWp),
          // Straight up, the body first lines up with its footprint so it does not catch its head on the column beside it
          jump: context.isGrounded && (currentWp.x !== mobNode.x || alignedWith(currentWp)),
          climbUp: false,
          climbDown: false,
          isMining: false,
          miningTarget: null,
          isAttacking: false,
          animationState: 'jump',
        };

      case 'CLIMB':
        return {
          moveX: steer(currentWp) * 0.5,
          jump: false,
          climbUp: bodyMode ? currentWp.y < mobNode.y : currentWp.y < context.position.y,
          climbDown: bodyMode ? currentWp.y > mobNode.y : currentWp.y > context.position.y,
          isMining: false,
          miningTarget: null,
          isAttacking: false,
          animationState: 'walk',
        };

      case 'FALL':
        return {
          moveX: steer(currentWp),
          jump: false,
          climbUp: false,
          climbDown: false,
          isMining: false,
          miningTarget: null,
          isAttacking: false,
          // Walking off a ledge is a walk until the feet leave the ground
          animationState: context.isGrounded ? 'walk' : 'jump',
        };

      case 'WALK':
      default: {
        const moveDir = steer(currentWp);
        let shouldJump = false;
        if (bodyMode) {
          // A one-cell step is walked up by the body itself; only a higher obstacle needs a jump
          const ahead = mobNode.x + moveDir;
          if (context.isGrounded && moveDir !== 0 && footprintBlocked(ahead, mobNode.y) && footprintBlocked(ahead, mobNode.y - 1)) {
            for (let k = 2; k <= maxJumpTiles && !shouldJump; k++) {
              if (!footprintBlocked(ahead, mobNode.y - k) && !footprintBlocked(mobNode.x, mobNode.y - k)) shouldJump = true;
            }
          }
        } else if (context.isGrounded && moveDir !== 0) {
          const aheadX = Math.floor(context.position.x + moveDir * 0.55 * BLOCK_SCALE);
          const currentY = Math.floor(context.position.y);
          const headY = currentY - 1;
          const isObstacleAhead = isTileObstacle(aheadX, currentY);
          const hasClearanceAboveObstacle = !isTileObstacle(aheadX, headY);
          const hasClearanceAboveHead = !isTileObstacle(Math.floor(context.position.x), headY);
          if (isObstacleAhead && hasClearanceAboveObstacle && hasClearanceAboveHead) {
            shouldJump = true;
          }
        }
        return {
          moveX: moveDir,
          jump: shouldJump,
          climbUp: false,
          climbDown: false,
          isMining: false,
          miningTarget: null,
          isAttacking: false,
          animationState: shouldJump ? 'jump' : 'walk',
        };
      }
    }
  }
}
