import type { MiningPosition, Vector2D, MobAIConfig } from '../../types/mining';
import type { MiningCollisionGrid } from '../../physics/MiningPhysicsBody';

export interface PlayerTargetInfo {
  characterId: string;
  characterName?: string;
  position: Vector2D;
  health: number;
}

export interface MobAIContext {
  mobId: string;
  instanceId: string;
  position: Vector2D;
  velocity: Vector2D;
  health: number;
  maxHealth: number;
  attack: number;
  defense: number;
  isGrounded: boolean;
  isOnLadder: boolean;
  grid: MiningCollisionGrid;
  players: PlayerTargetInfo[];
  config?: MobAIConfig;
}

export interface MobActionIntent {
  moveX: number;
  jump: boolean;
  climbUp: boolean;
  climbDown: boolean;
  isMining: boolean;
  miningTarget: MiningPosition | null;
  isAttacking: boolean;
  attackTargetId?: string;
  animationState: 'idle' | 'walk' | 'mine' | 'attack' | 'jump' | 'damage' | 'death';
}

/**
 * Abstract base class for all NPC/Mob AI controllers.
 * Subclasses implement specific behavior strategies (e.g. ChaseAndMine, Patrol, Passive).
 */
export abstract class BaseMobAI {
  public readonly mobId: string;
  public readonly instanceId: string;

  constructor(mobId: string, instanceId: string) {
    this.mobId = mobId;
    this.instanceId = instanceId;
  }

  /**
   * Evaluates environment context and determines the mob's desired action intent for this tick.
   */
  public abstract update(dt: number, context: MobAIContext): MobActionIntent;

  /**
   * Helper to check if a position is within mining/interaction reach of a target tile.
   */
  public static isWithinReach(
    pos: Vector2D,
    target: MiningPosition,
    reach: number = 2.0
  ): boolean {
    const dx = Math.abs(target.x + 0.5 - pos.x);
    const dy = Math.abs(target.y + 0.5 - pos.y);
    return dx <= reach && dy <= reach;
  }

  /**
   * Helper to check if a tile on the grid is solid obstacle.
   */
  public static isTileObstacle(grid: MiningCollisionGrid, tx: number, ty: number): boolean {
    const row = grid[ty];
    const tile = row ? row[tx] : undefined;
    if (!tile) return false;
    // Empty (0) and Entrance (1) are not obstacles
    return tile.type !== 0 && tile.type !== 1;
  }
}
