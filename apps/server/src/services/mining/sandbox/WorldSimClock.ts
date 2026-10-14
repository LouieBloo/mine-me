import { SANDBOX_SIM_SPEEDS } from '@mine-me/shared';

/**
 * Decides how many fluid/fire steps to run on a tick, so the sandbox can pause the flow, advance it
 * one step at a time, or run it faster or slower. Normal rooms never use this: they step on every
 * Nth tick, exactly as before.
 */
export class WorldSimClock {
  public paused = false;
  public speed = 1;
  private credit = 0;
  private stepRequests = 0;

  /** Asks for one step to run on the next tick (used while paused). */
  public requestStep(): void {
    this.stepRequests = Math.min(this.stepRequests + 1, 10);
  }

  /** True for a speed the sandbox offers. */
  public static isValidSpeed(speed: unknown): speed is number {
    return typeof speed === 'number' && (SANDBOX_SIM_SPEEDS as readonly number[]).includes(speed);
  }

  /**
   * How many steps to run this tick. `isBeat` says whether this tick is one where a normal room
   * would step. While paused only requested steps run; otherwise each beat adds `speed` steps'
   * worth of credit (so 0.5 runs every other beat and 4 runs four steps).
   */
  public stepsForTick(isBeat: boolean): number {
    if (this.paused) {
      const n = this.stepRequests;
      this.stepRequests = 0;
      return n;
    }
    this.stepRequests = 0;
    if (!isBeat) return 0;
    this.credit += this.speed;
    const n = Math.floor(this.credit + 1e-9);
    this.credit -= n;
    return n;
  }
}
