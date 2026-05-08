/**
 * SpriteMotion is a generic PixiJS tween utility for moving Containers
 * from one position to another using the shared Ticker.
 *
 * All movements are non-destructive: they tween `container.x` and `container.y`
 * and restore the element to its original coordinates when complete.
 */
import { Container, Ticker } from 'pixi.js';

/** Available easing functions for motion tweens. */
export type EasingFunction = 'easeInOut' | 'easeOut' | 'easeIn' | 'linear';

/** Configuration for a single motion tween. */
export interface MotionOptions {
  /** The PixiJS Container to move. */
  container: Container;
  /** Target X offset in pixels (relative to CURRENT position, i.e., currentX + targetX). */
  targetX: number;
  /** Target Y offset in pixels (relative to CURRENT position). */
  targetY: number;
  /** Duration of the tween in milliseconds. */
  duration: number;
  /** Easing function to apply. Default: 'easeInOut'. */
  easing?: EasingFunction;
}

/** Configuration for a move-to-and-back tween (attack lunge). */
export interface LungeOptions extends MotionOptions {
  /** Origin X position to return to. */
  originX: number;
  /** Origin Y position to return to. */
  originY: number;
  /** Duration to hold at the target position in milliseconds. Default: 200. */
  holdDuration?: number;
}

/** Easing function implementations. */
const EASINGS: Record<EasingFunction, (t: number) => number> = {
  linear: (t) => t,
  easeIn: (t) => t * t,
  easeOut: (t) => t * (2 - t),
  easeInOut: (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
};

/**
 * SpriteMotion provides static methods for tweening PixiJS Containers
 * with Ticker-based animation. All methods return Promises
 * that resolve when the animation completes.
 */
export class SpriteMotion {
  /**
   * Move a container from its current position to a target offset.
   *
   * @returns Promise that resolves when the movement completes.
   */
  static moveTo(options: MotionOptions): Promise<void> {
    const { container, targetX, targetY, duration, easing = 'easeInOut' } = options;
    const easeFn = EASINGS[easing];

    return new Promise<void>((resolve) => {
      const startX = container.x;
      const startY = container.y;
      
      // targetX/targetY are offsets from the STARTING position
      const finalX = startX + targetX;
      const finalY = startY + targetY;

      if (duration <= 0) {
        container.x = finalX;
        container.y = finalY;
        resolve();
        return;
      }

      let elapsed = 0;

      const animate = (ticker: Ticker) => {
        elapsed += ticker.deltaMS;
        const progress = Math.min(elapsed / duration, 1);
        const eased = easeFn(progress);

        container.x = startX + (finalX - startX) * eased;
        container.y = startY + (finalY - startY) * eased;

        if (progress >= 1) {
          Ticker.shared.remove(animate);
          resolve();
        }
      };

      Ticker.shared.add(animate);
    });
  }

  /**
   * Move a container to the target offset, hold briefly, then return to origin.
   * This is the "lunge" animation used for attack actions.
   *
   * @returns Promise that resolves when the full lunge cycle completes.
   */
  static async lunge(options: LungeOptions): Promise<void> {
    const { container, targetX, targetY, originX, originY, duration, holdDuration = 200 } = options;

    const halfDuration = duration / 2;

    // 1. Move to target (offset from current)
    await SpriteMotion.moveTo({
      container,
      targetX,
      targetY,
      duration: halfDuration,
      easing: 'easeIn',
    });

    // 2. Hold at target
    if (holdDuration > 0) {
      await SpriteMotion.wait(holdDuration);
    }

    // 3. Return to origin (absolute position)
    await SpriteMotion.moveBack(container, originX, originY, halfDuration);
  }

  /**
   * Animate a container back to its absolute origin position.
   */
  static moveBack(container: Container, originX: number, originY: number, duration: number): Promise<void> {
    const easeFn = EASINGS.easeOut;

    return new Promise<void>((resolve) => {
      const startX = container.x;
      const startY = container.y;

      if (duration <= 0) {
        container.x = originX;
        container.y = originY;
        resolve();
        return;
      }

      let elapsed = 0;

      const animate = (ticker: Ticker) => {
        elapsed += ticker.deltaMS;
        const progress = Math.min(elapsed / duration, 1);
        const eased = easeFn(progress);

        container.x = startX + (originX - startX) * eased;
        container.y = startY + (originY - startY) * eased;

        if (progress >= 1) {
          Ticker.shared.remove(animate);
          resolve();
        }
      };

      Ticker.shared.add(animate);
    });
  }

  /**
   * Wait for a specified duration. Utility for sequencing.
   */
  static wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Calculate the horizontal offset needed for container A to reach container B.
   * Returns the (deltaX, deltaY) offset that, when added to A's position, moves A next to B.
   *
   * @param gap Pixels of gap to leave between elements. Default: 30.
   * @param direction 'left' means A approaches from the left, 'right' from the right.
   */
  static calculateLungeOffset(
    attacker: Container,
    target: Container,
    gap = 30,
    direction: 'left' | 'right' = 'right'
  ): { x: number; y: number } {
    // In Pixi, containers usually have anchor at 0.5, 0.5.
    // We assume attacker.x/y and target.x/y are their center points.
    
    // We need approximate widths. Let's use getBounds().
    const attackerBounds = attacker.getBounds();

    // We can use the global position to calculate the actual distance between the two sprites
    // since they might be nested inside different originContainers with different screen positions.
    const attackerGlobal = attacker.getGlobalPosition();
    const targetGlobal = target.getGlobalPosition();

    let deltaX = targetGlobal.x - attackerGlobal.x;
    let deltaY = targetGlobal.y - attackerGlobal.y;

    // Apply gap to stop short of the target
    if (direction === 'right') {
      // Attacker is on the left, moving right
      deltaX -= gap + (attackerBounds.width / 2);
    } else {
      // Attacker is on the right, moving left
      deltaX += gap + (attackerBounds.width / 2);
    }

    return { x: deltaX, y: deltaY };
  }
}
