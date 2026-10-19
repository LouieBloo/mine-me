import { describe, it, expect } from 'vitest';
import { sweptBoxContains } from './MiningRockSubsystem';

describe('sweptBoxContains', () => {
  const a = { x: 0, y: 0 };
  const b = { x: 0, y: 10 };

  it('is true for a point the box passes over', () => {
    expect(sweptBoxContains({ x: 0.5, y: 5 }, a, b, 1, 1)).toBe(true);
    expect(sweptBoxContains({ x: 0, y: 5 }, a, b, 0.1, 0.1)).toBe(true);
  });

  it('is false for a point beside the path, further than the box is wide', () => {
    expect(sweptBoxContains({ x: 1.6, y: 5 }, a, b, 1.5, 1.5)).toBe(false);
    expect(sweptBoxContains({ x: 1.4, y: 5 }, a, b, 1.5, 1.5)).toBe(true);
  });

  it('reaches the box size beyond each end of the path', () => {
    expect(sweptBoxContains({ x: 0, y: 11.4 }, a, b, 1.5, 1.5)).toBe(true);
    expect(sweptBoxContains({ x: 0, y: 11.6 }, a, b, 1.5, 1.5)).toBe(false);
    expect(sweptBoxContains({ x: 0, y: -1.4 }, a, b, 1.5, 1.5)).toBe(true);
  });

  it('handles a path of zero length', () => {
    expect(sweptBoxContains({ x: 0.3, y: 0.3 }, a, a, 0.5, 0.5)).toBe(true);
    expect(sweptBoxContains({ x: 0.6, y: 0 }, a, a, 0.5, 0.5)).toBe(false);
  });
});
