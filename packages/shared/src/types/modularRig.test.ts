import { describe, it, expect } from 'vitest';
import { DEFAULT_RIG_FOOT_DEPTH, rigFootDepth } from './modularRig';

const leg = (offsetY: number, height: number, pivotY: number) => ({ height, pivot_anchor: [0.5, pivotY] as [number, number], offset_from_pelvis: [0, offsetY] as [number, number] });

describe('rigFootDepth', () => {
  it('is the lowest end of the legs: where the leg hangs plus what is below its pivot', () => {
    // the miner rig: front leg 60 + 380 * 0.95, back leg 30 + 380 * 0.95
    expect(rigFootDepth({ parts: { leg_front: leg(60, 380, 0.05), leg_back: leg(30, 380, 0.05) } })).toBeCloseTo(421);
  });

  it('is shallower for a rig with shorter legs (the mole)', () => {
    expect(rigFootDepth({ parts: { leg_front: leg(-5, 290, 0.05), leg_back: leg(-12, 290, 0.05) } })).toBeCloseTo(270.5);
  });

  it('ignores parts that are not legs', () => {
    expect(rigFootDepth({ parts: { torso: leg(0, 900, 0), leg_front: leg(0, 100, 0) } })).toBe(100);
  });

  it('falls back to the miner rig depth when there are no legs', () => {
    expect(rigFootDepth({ parts: {} })).toBe(DEFAULT_RIG_FOOT_DEPTH);
    expect(rigFootDepth(null)).toBe(DEFAULT_RIG_FOOT_DEPTH);
    expect(rigFootDepth(undefined)).toBe(DEFAULT_RIG_FOOT_DEPTH);
  });
});
