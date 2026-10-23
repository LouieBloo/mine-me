import { describe, it, expect, vi } from 'vitest';
import { Container } from 'pixi.js';
import type { MiningBeltClientState } from '@mine-me/shared';
import { BeltRenderer, stripePhase, stripePosition } from './BeltRenderer';

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

describe('stripePosition', () => {
  it('climbs as the belt runs (items ride UP to the extractor), and wraps round at the top', () => {
    let previous = stripePosition(1, 0);
    for (const phase of [0.1, 0.2, 0.3, 0.4]) {
      const now = stripePosition(1, phase);
      expect(now).toBeLessThan(previous);
      previous = now;
    }
    expect(stripePosition(0, 0)).toBe(0);
    expect(stripePosition(0, 0.25)).toBeGreaterThan(0.8); // went off the top and came in at the bottom
    for (const phase of [0, 0.3, 0.99]) for (const s of [0, 1]) {
      const pos = stripePosition(s, phase);
      expect(pos).toBeGreaterThanOrEqual(0);
      expect(pos).toBeLessThan(1);
    }
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

  it('with art loaded, the art stays and only gaps and cracks are drawn over it, and the art stands still while the belt waits', async () => {
    const texture = { width: 189, height: 63 } as any;
    const belt = new BeltRenderer(new Container(), state({ rows: 3, stages: [0, -1, 3], beltSpeed: 6, textureUrl: '/assets/sprites/extractors/e-belt.png' }), vi.fn().mockResolvedValue(texture));
    await Promise.resolve();
    await Promise.resolve();
    const art = (belt as any).art;
    expect(art).not.toBeNull();
    expect(art.tileScale.x).toBeCloseTo((3 * 21) / 189); // one repeat is the shaft wide, whatever the picture's resolution
    expect(belt.root.children[0]).toBe(art);
    belt.update(0.2);
    const moved = art.tilePosition.y;
    expect(moved).toBeLessThan(0); // the picture climbs, like the items
    belt.setRows(3, 'fluid');
    belt.update(1);
    expect(art.tilePosition.y).toBe(moved);
    belt.setRows(3, null);
    belt.update(0.2);
    expect(art.tilePosition.y).toBeLessThan(moved);
  });
});
