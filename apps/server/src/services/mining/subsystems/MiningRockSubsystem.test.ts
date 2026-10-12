import { describe, it, expect } from 'vitest';
import { distanceToSegment } from './MiningRockSubsystem';

describe('distanceToSegment', () => {
  const a = { x: 0, y: 0 };
  const b = { x: 0, y: 10 };

  it('measures to the nearest point on the segment', () => {
    expect(distanceToSegment({ x: 1, y: 5 }, a, b)).toBe(1);
    expect(distanceToSegment({ x: 0, y: 5 }, a, b)).toBe(0);
  });

  it('measures to the nearest end when beyond the segment', () => {
    expect(distanceToSegment({ x: 0, y: 13 }, a, b)).toBe(3);
    expect(distanceToSegment({ x: 4, y: -3 }, a, b)).toBe(5);
  });

  it('handles a zero-length segment', () => {
    expect(distanceToSegment({ x: 3, y: 4 }, a, a)).toBe(5);
  });
});
