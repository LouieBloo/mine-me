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
}
