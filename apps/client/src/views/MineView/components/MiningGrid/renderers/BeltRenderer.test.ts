import { describe, it, expect, vi } from 'vitest';
import { Container } from 'pixi.js';
import type { MiningBeltClientState } from '@mine-me/shared';
import { BeltRenderer, stripePhase } from './BeltRenderer';

const state = (over: Partial<MiningBeltClientState> = {}): MiningBeltClientState => ({
  shaftX: 90, shaftWidth: 3, startRow: 24, rows: 0, blockedBy: null, beltSpeed: 6, textureUrl: null, ...over,
});

describe('stripePhase', () => {
  it('moves with time and speed and wraps into 0..1', () => {
    expect(stripePhase(0, 6)).toBe(0);
    expect(stripePhase(0.25, 1)).toBeCloseTo(0.5);
    for (const t of [0.1, 1.7, 33.3]) {
      const p = stripePhase(t, 6);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThan(1);
    }
    expect(stripePhase(1, 0)).toBe(0);
  });
});

describe('BeltRenderer', () => {
  it('starts with the rows the join state had, and grows with the server', () => {
    const parent = new Container();
    const belt = new BeltRenderer(parent, state({ rows: 4 }));
    expect(parent.children).toContain(belt.root);
    expect(belt.segmentCount).toBe(4);
    belt.setRows(5, null);
    expect(belt.segmentCount).toBe(5);
    belt.destroy();
  });

  it('remembers what the belt is waiting for', () => {
    const belt = new BeltRenderer(new Container(), state({ rows: 2 }));
    belt.setRows(2, 'fluid');
    expect(belt.waitingFor).toBe('fluid');
    belt.setRows(3, null);
    expect(belt.waitingFor).toBeNull();
  });

  it('draws nothing for an empty belt, and something once it has segments', () => {
    const belt = new BeltRenderer(new Container(), state());
    belt.update(1);
    const empty = (belt as any).graphics.context.instructions.length;
    belt.setRows(3, null);
    belt.update(0.1);
    expect((belt as any).graphics.context.instructions.length).toBeGreaterThan(empty);
  });

  it('survives a failed art load and stops updating once destroyed', async () => {
    const loader = vi.fn().mockResolvedValue(null);
    const belt = new BeltRenderer(new Container(), state({ rows: 1, textureUrl: '/assets/sprites/belt.png' }), loader);
    await Promise.resolve();
    expect(loader).toHaveBeenCalledWith('/assets/sprites/belt.png');
    belt.destroy();
    expect(() => belt.update(1)).not.toThrow();
  });

  it('keeps the damage stage of each segment, treating an unknown one as whole', () => {
    const belt = new BeltRenderer(new Container(), state({ rows: 3, stages: [0, 2, -1] }));
    expect(belt.stageOf(1)).toBe(2);
    expect(belt.stageOf(2)).toBe(-1);
    expect(belt.stageOf(7)).toBe(0);
    belt.setStages([0, 0, 4]);
    expect(belt.stageOf(2)).toBe(4);
  });

  it('draws a broken segment as less than a whole one, and a cracked one as more', () => {
    const count = (stages: number[]) => {
      const belt = new BeltRenderer(new Container(), state({ rows: 1, stages }));
      return (belt as any).graphics.context.instructions.length;
    };
    expect(count([-1])).toBeLessThan(count([0]));
    expect(count([3])).toBeGreaterThan(count([0]));
  });
});
