import type { MobAIContext } from '../ai/BaseMobAI';
import type { MiningMobBody } from '../../physics/MiningMobBody';

export interface MobAbilityContext {
  aiContext: MobAIContext;
  mobBody: MiningMobBody;
}

/**
 * Base abstract class for mob abilities (e.g. Tunneling Dash, Ground Slam, Web Shoot).
 * Architected to allow modular, easily pluggable special attacks and active powers.
 */
export abstract class BaseMobAbility {
  public abstract readonly id: string;
  public abstract readonly name: string;
  public abstract readonly cooldownSeconds: number;
  protected currentCooldown: number = 0;

  public update(dt: number): void {
    if (this.currentCooldown > 0) {
      this.currentCooldown = Math.max(0, this.currentCooldown - dt);
    }
  }

  public get isReady(): boolean {
    return this.currentCooldown <= 0;
  }

  public get cooldownRemaining(): number {
    return this.currentCooldown;
  }

  /**
   * Evaluates if conditions are met to trigger the ability.
   */
  public canActivate(_context: MobAbilityContext): boolean {
    return this.isReady;
  }

  /**
   * Activates the ability effect.
   */
  public abstract activate(context: MobAbilityContext): void;
}
