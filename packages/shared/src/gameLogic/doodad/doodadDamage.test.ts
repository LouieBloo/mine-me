import { describe, it, expect } from 'vitest';
import {
  DOODAD_FALL_GRAVITY,
  DOODAD_FALL_MAX_SPEED,
  boxContainsPoint,
  boxesOverlap,
  distanceToBox,
  doodadFallMass,
  doodadFalls,
  doodadHurtBox,
  segmentTouchesBox,
  stepFall,
  type FallingState,
} from './doodadDamage';

describe('doodadHurtBox', () => {
  it('is the footprint for a doodad that stays put', () => {
    expect(doodadHurtBox({ x: 10, y: 5, width: 3, height: 2 })).toEqual({ x0: 10, y0: 5, x1: 13, y1: 7 });
  });

  it('grows by the wander radius, because the server does not know where the bug is', () => {
    const box = doodadHurtBox({ x: 10, y: 5, width: 3, height: 2 }, { mode: 'CRAWL', radius: 4, speed: 1, pauseMs: 100 });
    expect(box).toEqual({ x0: 6, y0: 1, x1: 17, y1: 11 });
  });
});

describe('box helpers', () => {
  const box = { x0: 0, y0: 0, x1: 4, y1: 4 };
  it('tests points with a margin', () => {
    expect(boxContainsPoint(box, 2, 2)).toBe(true);
    expect(boxContainsPoint(box, 4.5, 2)).toBe(false);
    expect(boxContainsPoint(box, 4.5, 2, 0.6)).toBe(true);
  });
  it('tests overlap, not touching edges', () => {
    expect(boxesOverlap(box, { x0: 3, y0: 3, x1: 6, y1: 6 })).toBe(true);
    expect(boxesOverlap(box, { x0: 4, y0: 0, x1: 6, y1: 4 })).toBe(false);
  });
  it('measures the distance to the nearest edge', () => {
    expect(distanceToBox(box, 2, 2)).toBe(0);
    expect(distanceToBox(box, 7, 2)).toBe(3);
    expect(distanceToBox(box, 7, 8)).toBe(5);
  });
  it('finds where a path first touches the box, and none when it misses', () => {
    const t = segmentTouchesBox(box, { x: -4, y: 2 }, { x: 8, y: 2 });
    expect(t).not.toBeNull();
    expect(t!).toBeGreaterThan(0.3);
    expect(t!).toBeLessThan(0.4);
    expect(segmentTouchesBox(box, { x: -4, y: 9 }, { x: 8, y: 9 })).toBeNull();
    expect(segmentTouchesBox(box, { x: -4, y: 4.4 }, { x: 8, y: 4.4 }, 0.5)).not.toBeNull();
  });
});

describe('falling', () => {
  it('only ceiling doodads fall', () => {
    expect(doodadFalls({ anchor: 'CEILING' })).toBe(true);
    for (const anchor of ['FLOOR', 'WALL', 'AIR'] as const) expect(doodadFalls({ anchor })).toBe(false);
  });

  it('weighs a doodad by its fall damage, else like a rock of the same size', () => {
    expect(doodadFallMass({ fallDamage: 7 }, { width: 3, height: 3 })).toBe(7);
    expect(doodadFallMass({ fallDamage: null }, { width: 3, height: 3 })).toBe(9);
    expect(doodadFallMass({}, { width: 1, height: 1 })).toBe(1);
  });

  const open = () => false;
  const start: FallingState = { x: 4, y: 0, width: 3, height: 2, vy: 0 };

  it('speeds up under gravity', () => {
    const { state, landed } = stepFall(start, 0.1, open, 100);
    expect(landed).toBe(false);
    expect(state.vy).toBeCloseTo(DOODAD_FALL_GRAVITY * 0.1);
    expect(state.y).toBeCloseTo(state.vy * 0.1);
  });

  it('never goes faster than the top speed', () => {
    const { state } = stepFall({ ...start, vy: DOODAD_FALL_MAX_SPEED }, 0.5, open, 1000);
    expect(state.vy).toBe(DOODAD_FALL_MAX_SPEED);
  });

  it('lands on the first solid row under its footprint, even in one very long step', () => {
    const solid = (_x: number, y: number) => y === 30;
    const { state, landed } = stepFall({ ...start, vy: DOODAD_FALL_MAX_SPEED }, 1, solid, 100);
    expect(landed).toBe(true);
    expect(state.y + state.height).toBe(30);
  });

  it('is held up by a floor under any column of its width', () => {
    const solid = (x: number, y: number) => x === 6 && y === 10;
    const { state, landed } = stepFall({ ...start, y: 7.5, vy: 30 }, 0.5, solid, 100);
    expect(landed).toBe(true);
    expect(state.y).toBe(8);
  });

  it('is not held up by a floor beside it', () => {
    const solid = (x: number, y: number) => x === 7 && y === 10;
    expect(stepFall({ ...start, y: 7.5, vy: 30 }, 0.5, solid, 100).landed).toBe(false);
  });

  it('lands at the bottom of the map', () => {
    const { state, landed } = stepFall({ ...start, y: 17, vy: 100 }, 0.5, open, 20);
    expect(landed).toBe(true);
    expect(state.y + state.height).toBe(20);
  });

  it('lands at once when it already rests on something', () => {
    const solid = (_x: number, y: number) => y === 2;
    expect(stepFall(start, 0.05, solid, 100).landed).toBe(true);
  });
});
