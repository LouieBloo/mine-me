import { SpriteMotion } from '../sprites/SpriteMotion';
import { Container } from 'pixi.js';

/**
 * A single step in a combat animation sequence.
 *
 * Steps are executed sequentially. Each step type controls a different
 * aspect of the animation pipeline:
 *
 * - 'moveTo': Slide an element to a computed offset
 * - 'moveBack': Return an element to its origin
 * - 'effect': Fire a visual effect synchronously (floating text, etc.)
 * - 'callback': Execute an arbitrary async callback
 * - 'wait': Pause for a duration
 * - 'parallel': Execute multiple steps simultaneously
 */
export type CombatAnimationStep =
  | MoveToStep
  | MoveBackStep
  | EffectStep
  | CallbackStep
  | WaitStep
  | ParallelStep;

export interface MoveToStep {
  type: 'moveTo';
  /** The PixiJS Container to move. */
  container: Container;
  /** Target X offset from origin, in pixels. */
  targetX: number;
  /** Target Y offset from origin, in pixels. */
  targetY: number;
  /** Duration in ms. Default: 300. */
  duration?: number;
  /** Easing function. Default: 'easeIn'. */
  easing?: 'easeInOut' | 'easeOut' | 'easeIn' | 'linear';
}

export interface MoveBackStep {
  type: 'moveBack';
  /** The PixiJS Container to return to origin. */
  container: Container;
  /** Origin X position. */
  originX: number;
  /** Origin Y position. */
  originY: number;
  /** Duration in ms. Default: 300. */
  duration?: number;
}

export interface EffectStep {
  type: 'effect';
  /** Synchronous callback to trigger a visual effect. */
  execute: () => void;
}

export interface CallbackStep {
  type: 'callback';
  /** Async or sync callback to invoke at this point in the sequence. */
  execute: () => void | Promise<void>;
}

export interface WaitStep {
  type: 'wait';
  /** Duration in milliseconds. */
  duration: number;
}

export interface ParallelStep {
  type: 'parallel';
  /** Steps to execute simultaneously. */
  steps: CombatAnimationStep[];
}

/**
 * CombatAnimationSequencer orchestrates turn-based combat animations.
 *
 * It takes a list of steps and executes them sequentially, coordinating
 * sprite movement, animation changes, floating damage text, and chat log
 * flushing so they all appear synchronized.
 */
export class CombatAnimationSequencer {
  private cancelled = false;

  /**
   * Play a full sequence of combat animation steps.
   * Steps execute one at a time (except 'parallel' which runs its children concurrently).
   *
   * @returns Promise that resolves when all steps are complete.
   */
  async playSequence(steps: CombatAnimationStep[]): Promise<void> {
    this.cancelled = false;

    for (const step of steps) {
      if (this.cancelled) return;
      await this.executeStep(step);
    }
  }

  /**
   * Cancel the currently running sequence.
   * Any in-progress movement will complete its current frame but no further steps execute.
   */
  cancel(): void {
    this.cancelled = true;
  }

  /** Whether the sequencer has been cancelled. */
  isCancelled(): boolean {
    return this.cancelled;
  }

  /**
   * Execute a single step based on its type.
   */
  private async executeStep(step: CombatAnimationStep): Promise<void> {
    if (this.cancelled) return;

    switch (step.type) {
      case 'moveTo':
        return this.executeMoveTo(step);
      case 'moveBack':
        return this.executeMoveBack(step);
      case 'effect':
        return this.executeEffect(step);
      case 'callback':
        return this.executeCallback(step);
      case 'wait':
        return this.executeWait(step);
      case 'parallel':
        return this.executeParallel(step);
    }
  }

  private async executeMoveTo(step: MoveToStep): Promise<void> {
    await SpriteMotion.moveTo({
      container: step.container,
      targetX: step.targetX,
      targetY: step.targetY,
      duration: step.duration ?? 300,
      easing: step.easing ?? 'easeIn',
    });
  }

  private async executeMoveBack(step: MoveBackStep): Promise<void> {
    await SpriteMotion.moveBack(step.container, step.originX, step.originY, step.duration ?? 300);
  }

  private async executeEffect(step: EffectStep): Promise<void> {
    try {
      step.execute();
    } catch (err) {
      console.warn('[CombatAnimationSequencer] Effect step failed:', err);
    }
  }

  private async executeCallback(step: CallbackStep): Promise<void> {
    try {
      await step.execute();
    } catch (err) {
      console.warn('[CombatAnimationSequencer] Callback step failed:', err);
    }
  }

  private async executeWait(step: WaitStep): Promise<void> {
    await SpriteMotion.wait(step.duration);
  }

  private async executeParallel(step: ParallelStep): Promise<void> {
    await Promise.all(step.steps.map((s) => this.executeStep(s)));
  }
}

/**
 * Helper to build attack animation steps for a single attacker → target interaction.
 *
 * This encapsulates the common attack pattern:
 * 1. Slide attacker toward target
 * 2. At impact: fire onImpact callback (floating text, chat logs, animation change)
 * 3. Hold briefly
 * 4. Slide attacker back to origin
 *
 * @returns An array of CombatAnimationStep to feed into the sequencer.
 */
export function buildAttackSteps(options: {
  attacker: Container;
  target: Container;
  attackerOriginX: number;
  attackerOriginY: number;
  direction: 'left' | 'right';
  /** Called when the attacker reaches the target (impact moment). */
  onImpact: () => void;
  /** Called when the attacker starts moving. Optional. */
  onMoveStart?: () => void;
  /** Called when the attacker returns to idle. Optional. */
  onReturnIdle?: () => void;
  /** Approach duration in ms. Default: 300. */
  approachDuration?: number;
  /** Return duration in ms. Default: 300. */
  returnDuration?: number;
  /** Hold at target duration in ms. Default: 250. */
  holdDuration?: number;
}): CombatAnimationStep[] {
  const {
    attacker,
    target,
    attackerOriginX,
    attackerOriginY,
    direction,
    onImpact,
    onMoveStart,
    onReturnIdle,
    approachDuration = 300,
    returnDuration = 300,
    holdDuration = 250,
  } = options;

  // Calculate lunge offset
  const offset = SpriteMotion.calculateLungeOffset(attacker, target, 30, direction);

  const steps: CombatAnimationStep[] = [];

  // 1. Trigger move animation (if provided)
  if (onMoveStart) {
    steps.push({ type: 'effect', execute: onMoveStart });
  }

  // 2. Slide toward target
  steps.push({
    type: 'moveTo',
    container: attacker,
    targetX: offset.x,
    targetY: offset.y,
    duration: approachDuration,
    easing: 'easeIn',
  });

  // 3. Impact: trigger floating text, chat logs, attack animation
  steps.push({ type: 'effect', execute: onImpact });

  // 4. Hold at target
  steps.push({ type: 'wait', duration: holdDuration });

  // 5. Trigger idle animation (if provided) and slide back
  if (onReturnIdle) {
    steps.push({ type: 'effect', execute: onReturnIdle });
  }
  steps.push({
    type: 'moveBack',
    container: attacker,
    originX: attackerOriginX,
    originY: attackerOriginY,
    duration: returnDuration,
  });

  // 6. Brief pause between attacks
  steps.push({ type: 'wait', duration: 100 });

  return steps;
}

