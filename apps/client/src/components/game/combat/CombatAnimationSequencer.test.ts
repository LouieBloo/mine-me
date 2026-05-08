import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CombatAnimationSequencer } from './CombatAnimationSequencer';
import type { CombatAnimationStep } from './CombatAnimationSequencer';
import { Container } from 'pixi.js';

// Mock SpriteMotion since it uses DOM APIs not available in test environment
vi.mock('../sprites/SpriteMotion', () => ({
  SpriteMotion: {
    moveTo: vi.fn().mockResolvedValue(undefined),
    moveBack: vi.fn().mockResolvedValue(undefined),
    wait: vi.fn().mockResolvedValue(undefined),
    calculateLungeOffset: vi.fn().mockReturnValue({ x: 100, y: 0 }),
  },
}));

describe('CombatAnimationSequencer', () => {
  let sequencer: CombatAnimationSequencer;

  beforeEach(() => {
    sequencer = new CombatAnimationSequencer();
    vi.clearAllMocks();
  });

  it('should execute steps sequentially', async () => {
    const order: number[] = [];

    const steps: CombatAnimationStep[] = [
      { type: 'effect', execute: () => order.push(1) },
      { type: 'effect', execute: () => order.push(2) },
      { type: 'effect', execute: () => order.push(3) },
    ];

    await sequencer.playSequence(steps);

    expect(order).toEqual([1, 2, 3]);
  });

  it('should execute callback steps and await async callbacks', async () => {
    let callbackRan = false;

    const steps: CombatAnimationStep[] = [
      {
        type: 'callback',
        execute: async () => {
          callbackRan = true;
        },
      },
    ];

    await sequencer.playSequence(steps);

    expect(callbackRan).toBe(true);
  });

  it('should execute wait steps', async () => {
    const { SpriteMotion } = await import('../sprites/SpriteMotion');

    const steps: CombatAnimationStep[] = [
      { type: 'wait', duration: 500 },
    ];

    await sequencer.playSequence(steps);

    expect(SpriteMotion.wait).toHaveBeenCalledWith(500);
  });

  it('should execute moveTo steps', async () => {
    const { SpriteMotion } = await import('../sprites/SpriteMotion');
    const container = new Container();

    const steps: CombatAnimationStep[] = [
      { type: 'moveTo', container, targetX: 200, targetY: 50, duration: 300, easing: 'easeIn' },
    ];

    await sequencer.playSequence(steps);

    expect(SpriteMotion.moveTo).toHaveBeenCalledWith({
      container,
      targetX: 200,
      targetY: 50,
      duration: 300,
      easing: 'easeIn',
    });
  });

  it('should execute moveBack steps', async () => {
    const { SpriteMotion } = await import('../sprites/SpriteMotion');
    const container = new Container();

    const steps: CombatAnimationStep[] = [
      { type: 'moveBack', container, originX: 0, originY: 0, duration: 400 },
    ];

    await sequencer.playSequence(steps);

    expect(SpriteMotion.moveBack).toHaveBeenCalledWith(container, 0, 0, 400);
  });

  it('should execute parallel steps concurrently', async () => {
    const order: string[] = [];

    const steps: CombatAnimationStep[] = [
      {
        type: 'parallel',
        steps: [
          { type: 'effect', execute: () => order.push('a') },
          { type: 'effect', execute: () => order.push('b') },
        ],
      },
    ];

    await sequencer.playSequence(steps);

    // Both should have run
    expect(order).toContain('a');
    expect(order).toContain('b');
    expect(order.length).toBe(2);
  });

  it('should stop executing steps after cancel', async () => {
    const order: number[] = [];

    const steps: CombatAnimationStep[] = [
      { type: 'effect', execute: () => order.push(1) },
      { type: 'callback', execute: () => { sequencer.cancel(); } },
      { type: 'effect', execute: () => order.push(3) },
    ];

    await sequencer.playSequence(steps);

    // Step 3 should not have run
    expect(order).toEqual([1]);
    expect(sequencer.isCancelled()).toBe(true);
  });

  it('should not crash when effect step throws', async () => {
    const steps: CombatAnimationStep[] = [
      { type: 'effect', execute: () => { throw new Error('boom'); } },
      { type: 'effect', execute: () => {} },
    ];

    // Should not throw
    await expect(sequencer.playSequence(steps)).resolves.toBeUndefined();
  });

  it('should not crash when callback step throws', async () => {
    const steps: CombatAnimationStep[] = [
      { type: 'callback', execute: () => { throw new Error('async boom'); } },
      { type: 'effect', execute: () => {} },
    ];

    await expect(sequencer.playSequence(steps)).resolves.toBeUndefined();
  });

  it('should use default values for moveTo when optional params omitted', async () => {
    const { SpriteMotion } = await import('../sprites/SpriteMotion');
    const container = new Container();

    const steps: CombatAnimationStep[] = [
      { type: 'moveTo', container, targetX: 100, targetY: 0 },
    ];

    await sequencer.playSequence(steps);

    expect(SpriteMotion.moveTo).toHaveBeenCalledWith({
      container,
      targetX: 100,
      targetY: 0,
      duration: 300,
      easing: 'easeIn',
    });
  });

  it('should use default duration for moveBack when not specified', async () => {
    const { SpriteMotion } = await import('../sprites/SpriteMotion');
    const container = new Container();

    const steps: CombatAnimationStep[] = [
      { type: 'moveBack', container, originX: 0, originY: 0 },
    ];

    await sequencer.playSequence(steps);

    expect(SpriteMotion.moveBack).toHaveBeenCalledWith(container, 0, 0, 300);
  });
});
