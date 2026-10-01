import { BaseMobAI, type MobAIContext, type MobActionIntent, type PlayerTargetInfo } from './BaseMobAI';
import { MiningPathfinder } from '../pathfinding/MiningPathfinder';
import { isTileSolid, type MiningPathWaypoint } from '../../types/mining';

/**
 * Intelligent Mob AI behavior that chases player characters through the cavern.
 * Navigates tunnels, leaps across platforms/gaps, climbs ladders, and excavates
 * obstructing blocks when direct paths are blocked.
 */
export class ChaseAndMineAI extends BaseMobAI {
  private path: MiningPathWaypoint[] = [];
  private pathTimer: number = 0;
  private attackCooldown: number = 0;
  private currentWaypointIndex: number = 0;
  private lastTargetPos: { x: number; y: number } | null = null;

  public update(dt: number, context: MobAIContext): MobActionIntent {
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    this.pathTimer = Math.max(0, this.pathTimer - dt);

    const aggroRange = context.config?.aggroRange ?? 20.0;
    const attackRange = context.config?.attackRange ?? 1.25;
    const canMine = context.config?.canMine ?? true;
    const mineRange = context.config?.mineRange ?? 2.0;
    const maxJumpTiles = context.config?.maxJumpTiles ?? 1;
    const attackCooldownSec = (context.config?.attackCooldownMs ?? 1200) / 1000;

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
      const facing = Math.sign(dx) || 1;
      const canAttack = this.attackCooldown <= 0;

      if (canAttack) {
        this.attackCooldown = attackCooldownSec;
        return {
          moveX: facing,
          jump: false,
          climbUp: false,
          climbDown: false,
          isMining: false,
          miningTarget: null,
          isAttacking: true,
          attackTargetId: nearestPlayer.characterId,
          animationState: 'attack',
        };
      } else {
        return {
          moveX: 0,
          jump: false,
          climbUp: false,
          climbDown: false,
          isMining: false,
          miningTarget: null,
          isAttacking: false,
          animationState: 'idle',
        };
      }
    }

    // Helper to check if a tile is currently solid
    const isTileObstacle = (tx: number, ty: number): boolean => {
      const row = context.grid[ty];
      const tile = row ? row[tx] : undefined;
      return tile ? isTileSolid(tile.type as any) : false;
    };

    // 3. Path Recalculation
    const targetTile = {
      x: Math.floor(nearestPlayer.position.x),
      y: Math.floor(nearestPlayer.position.y),
    };

    const currentWpAtIdx = this.path[this.currentWaypointIndex];
    const isActivelyMining =
      currentWpAtIdx?.action === 'MINE' &&
      BaseMobAI.isWithinReach(context.position, currentWpAtIdx, mineRange) &&
      isTileObstacle(currentWpAtIdx.x, currentWpAtIdx.y);

    const targetMoved =
      !this.lastTargetPos ||
      Math.abs(this.lastTargetPos.x - targetTile.x) > 1.5 ||
      Math.abs(this.lastTargetPos.y - targetTile.y) > 1.5;

    // Do not interrupt an active block excavation on the periodic timer
    if (!isActivelyMining && (this.pathTimer <= 0 || targetMoved || this.currentWaypointIndex >= this.path.length)) {
      this.path = MiningPathfinder.findPath(
        { x: context.position.x, y: context.position.y },
        targetTile,
        context.grid,
        { canMine, maxJumpTiles }
      );
      this.currentWaypointIndex = 0;
      this.pathTimer = 1.0;
      this.lastTargetPos = targetTile;
    }

    // If the current waypoint was a MINE action and the block is now excavated (EMPTY), advance!
    while (
      this.currentWaypointIndex < this.path.length &&
      this.path[this.currentWaypointIndex].action === 'MINE' &&
      !isTileObstacle(this.path[this.currentWaypointIndex].x, this.path[this.currentWaypointIndex].y)
    ) {
      this.currentWaypointIndex++;
    }

    // If no path could be found or path is exhausted, attempt direct approach towards target
    if (this.path.length === 0 || this.currentWaypointIndex >= this.path.length) {
      const dirX = Math.sign(dx);
      const nextTileX = Math.floor(context.position.x + dirX * 0.6);
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

    const mobTileX = Math.floor(context.position.x);
    const mobTileY = Math.floor(context.position.y);

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
        const inReach = BaseMobAI.isWithinReach(context.position, currentWp, mineRange);
        if (!inReach) {
          // Walk towards the block until within mining reach
          const moveDir = Math.sign(currentWp.x + 0.5 - context.position.x);
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
          miningTarget: { x: currentWp.x, y: currentWp.y },
          isAttacking: false,
          animationState: 'mine',
        };
      }

      case 'JUMP':
        return {
          moveX: Math.sign(currentWp.x + 0.5 - context.position.x),
          jump: context.isGrounded,
          climbUp: false,
          climbDown: false,
          isMining: false,
          miningTarget: null,
          isAttacking: false,
          animationState: 'jump',
        };

      case 'CLIMB':
        return {
          moveX: Math.sign(currentWp.x + 0.5 - context.position.x) * 0.5,
          jump: false,
          climbUp: currentWp.y < context.position.y,
          climbDown: currentWp.y > context.position.y,
          isMining: false,
          miningTarget: null,
          isAttacking: false,
          animationState: 'walk',
        };

      case 'FALL':
        return {
          moveX: Math.sign(currentWp.x + 0.5 - context.position.x),
          jump: false,
          climbUp: false,
          climbDown: false,
          isMining: false,
          miningTarget: null,
          isAttacking: false,
          animationState: 'jump',
        };

      case 'WALK':
      default: {
        const moveDir = Math.sign(currentWp.x + 0.5 - context.position.x);
        let shouldJump = false;
        if (context.isGrounded && moveDir !== 0) {
          const aheadX = Math.floor(context.position.x + moveDir * 0.55);
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
