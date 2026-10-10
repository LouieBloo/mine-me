import { describe, it, expect } from 'vitest';
import { segmentAabbEntryTime } from './segmentAabb';

const box = { x: 10, y: 10 };

describe('segmentAabbEntryTime', () => {
  it('hits at the box face and reports the fraction along the segment', () => {
    // box spans x 9.5..10.5; segment 0..20 along y=10
    expect(segmentAabbEntryTime({ x: 0, y: 10 }, { x: 20, y: 10 }, box, 0.5, 0.5)).toBeCloseTo(9.5 / 20, 6);
  });

  it('a fast segment that jumps clean over the box still hits it', () => {
    expect(segmentAabbEntryTime({ x: 0, y: 10 }, { x: 100, y: 10 }, box, 0.1, 0.1)).not.toBeNull();
  });

  it('respects tall versus wide colliders', () => {
    // 0.5 above the centre line: misses a wide-flat box, hits a tall one
    const from = { x: 0, y: 9.2 };
    const to = { x: 20, y: 9.2 };
    expect(segmentAabbEntryTime(from, to, box, 1.5, 0.3)).toBeNull();
    expect(segmentAabbEntryTime(from, to, box, 0.3, 1.5)).not.toBeNull();
  });

  it('inflates the box by the bullet radius', () => {
    const from = { x: 0, y: 10.7 };
    const to = { x: 20, y: 10.7 };
    expect(segmentAabbEntryTime(from, to, box, 0.5, 0.5, 0)).toBeNull();
    expect(segmentAabbEntryTime(from, to, box, 0.5, 0.5, 0.25)).not.toBeNull();
  });

  it('returns 0 when starting inside, null when stopping short or moving away', () => {
    expect(segmentAabbEntryTime({ x: 10, y: 10 }, { x: 12, y: 10 }, box, 0.5, 0.5)).toBe(0);
    expect(segmentAabbEntryTime({ x: 0, y: 10 }, { x: 5, y: 10 }, box, 0.5, 0.5)).toBeNull();
    expect(segmentAabbEntryTime({ x: 15, y: 10 }, { x: 20, y: 10 }, box, 0.5, 0.5)).toBeNull();
  });

  it('handles vertical and diagonal segments', () => {
    expect(segmentAabbEntryTime({ x: 10, y: 0 }, { x: 10, y: 20 }, box, 0.5, 0.5)).toBeCloseTo(9.5 / 20, 6);
    expect(segmentAabbEntryTime({ x: 0, y: 0 }, { x: 20, y: 20 }, box, 0.5, 0.5)).not.toBeNull();
  });
});
