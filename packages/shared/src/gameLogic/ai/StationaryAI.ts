import { BaseMobAI, type MobAIContext, type MobActionIntent } from './BaseMobAI';

/**
 * Stationary AI behavior.
 * Remains stationary at its current position without moving, jumping,
 * mining, or attacking. Used for training dummies, totems, and stationary objects.
 */
export class StationaryAI extends BaseMobAI {
  public update(_dt: number, _context: MobAIContext): MobActionIntent {
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
