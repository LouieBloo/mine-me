import { BaseMobAI, type MobAIContext, type MobActionIntent, type PlayerTargetInfo } from './BaseMobAI';
import { MiningPathfinder } from '../pathfinding/MiningPathfinder';
import type { MiningPathWaypoint } from '../../types/mining';

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
    const maxJumpTiles = context.config?.maxJumpTiles ?? 2;
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

    // 3. Path Recalculation
    const targetTile = {
      x: Math.round(nearestPlayer.position.x),
      y: Math.round(nearestPlayer.position.y),
    };

    const targetMoved = !this.lastTargetPos ||
      Math.abs(this.lastTargetPos.x - targetTile.x) > 1.5 ||
      Math.abs(this.lastTargetPos.y - targetTile.y) > 1.5;

    if (this.pathTimer <= 0 || targetMoved || this.currentWaypointIndex >= this.path.length) {
      this.path = MiningPathfinder.findPath(
        { x: context.position.x, y: context.position.y },
        targetTile,
        context.grid,
        { canMine, maxJumpTiles }
      );
      this.currentWaypointIndex = 0;
      this.pathTimer = 0.8;
      this.lastTargetPos = targetTile;
    }

    // If no path could be found, attempt direct approach towards target
    if (this.path.length === 0 || this.currentWaypointIndex >= this.path.length) {
      return {
        moveX: Math.sign(dx),
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
    const wp = this.path[this.currentWaypointIndex];
    const distToWpX = wp.x - context.position.x;
    const distToWpY = wp.y - context.position.y;

    // Advance waypoint if close enough
    if (Math.abs(distToWpX) < 0.35 && Math.abs(distToWpY) < 0.5) {
      this.currentWaypointIndex++;
      if (this.currentWaypointIndex >= this.path.length) {
        return defaultIntent;
      }
    }

    const currentWp = this.path[this.currentWaypointIndex] || wp;

    switch (currentWp.action) {
      case 'MINE':
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

      case 'JUMP':
        return {
          moveX: Math.sign(currentWp.x - context.position.x),
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
          moveX: 0,
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
          moveX: Math.sign(currentWp.x - context.position.x),
          jump: false,
          climbUp: false,
          climbDown: false,
          isMining: false,
          miningTarget: null,
          isAttacking: false,
          animationState: 'jump',
        };

      case 'WALK':
      default:
        return {
          moveX: Math.sign(currentWp.x - context.position.x),
          jump: false,
          climbUp: false,
          climbDown: false,
          isMining: false,
          miningTarget: null,
          isAttacking: false,
          animationState: 'walk',
        };
    }
  }
}
