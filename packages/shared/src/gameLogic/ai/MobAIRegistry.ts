import { BaseMobAI } from './BaseMobAI';
import { ChaseAndMineAI } from './ChaseAndMineAI';
import { PatrolAI } from './PatrolAI';
import { StationaryAI } from './StationaryAI';
import type { MobAIType } from '../../types/mining';

export type MobAIConstructor = new (mobId: string, instanceId: string) => BaseMobAI;

/**
 * Registry and factory for Mob AI strategies.
 * Provides out-of-the-box behaviors and allows game modules to register custom AI classes.
 */
export class MobAIRegistry {
  private static registry: Map<string, MobAIConstructor> = new Map();

  static {
    // Register standard AI types
    this.register('CHASE_AND_MINE', ChaseAndMineAI);
    this.register('PATROL', PatrolAI);
    this.register('TUNNELER', ChaseAndMineAI);
    this.register('PASSIVE', PatrolAI);
    this.register('STATIONARY', StationaryAI);
  }

  /**
   * Register a new AI strategy class.
   */
  public static register(aiType: string, ctor: MobAIConstructor): void {
    this.registry.set(aiType.toUpperCase(), ctor);
  }

  /**
   * Instantiate an AI strategy for a mob.
   */
  public static create(aiType: MobAIType | string | undefined, mobId: string, instanceId: string): BaseMobAI {
    const key = (aiType || 'CHASE_AND_MINE').toUpperCase();
    const Ctor = this.registry.get(key) || ChaseAndMineAI;
    return new Ctor(mobId, instanceId);
  }
}
