import { BaseMobAI, type MobAIContext, type MobActionIntent } from './BaseMobAI';
import { ChaseAndMineAI } from './ChaseAndMineAI';

/**
 * Patrol AI behavior.
 * Patrols horizontally within a radius. Reverses direction when encountering walls or cliffs.
 * If a player enters aggro radius, delegates to ChaseAndMineAI.
 */
export class PatrolAI extends BaseMobAI {
  private direction: number = 1;
  private originX: number | null = null;
  private chaseDelegate: ChaseAndMineAI;

  constructor(mobId: string, instanceId: string) {
    super(mobId, instanceId);
    this.chaseDelegate = new ChaseAndMineAI(mobId, instanceId);
  }

  public update(dt: number, context: MobAIContext): MobActionIntent {
    if (this.originX === null) {
      this.originX = context.position.x;
    }

    const aggroRange = context.config?.aggroRange ?? 10.0;
    const patrolRadius = context.config?.patrolRadius ?? 6.0;

    // Check if any player is within aggro range
    let playerInAggro = false;
    for (const player of context.players) {
      if (player.health <= 0) continue;
      const dx = player.position.x - context.position.x;
      const dy = player.position.y - context.position.y;
      if (Math.sqrt(dx * dx + dy * dy) <= aggroRange) {
        playerInAggro = true;
        break;
      }
    }

    if (playerInAggro) {
      return this.chaseDelegate.update(dt, context);
    }

    // Patrol logic: reverse if distance from origin exceeds patrolRadius
    const offsetFromOrigin = context.position.x - this.originX;
    if (offsetFromOrigin > patrolRadius) {
      this.direction = -1;
    } else if (offsetFromOrigin < -patrolRadius) {
      this.direction = 1;
    }

    // Reverse if hitting a wall
    const nextTileX = Math.floor(context.position.x + this.direction * 0.6);
    const currentTileY = Math.floor(context.position.y);
    const tileAhead = context.grid[currentTileY]?.[nextTileX];
    if (tileAhead && tileAhead.type !== 0 && tileAhead.type !== 1) { // Not empty or entrance
      this.direction = -this.direction;
    }

    return {
      moveX: this.direction,
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
