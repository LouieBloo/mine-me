import { describe, it, expect } from 'vitest';
import { DoodadBodyIndex, type DoodadBody } from './doodadBodies';

const body = (id: string, x: number, y: number, radius = 1): DoodadBody => ({ id, x, y, vx: 0, vy: 0, radius });

describe('DoodadBodyIndex', () => {
  it('finds a body whose edge is within the radius, and none farther', () => {
    const index = new DoodadBodyIndex([body('a', 10, 10, 1)]);
    expect(index.near(10, 14, 3).map((b) => b.id)).toEqual(['a']); // 4 away, radius 3 + body 1
    expect(index.near(10, 14.5, 3)).toEqual([]);
  });

  it('looks across bucket borders and ignores bodies in far buckets', () => {
    const bodies = [body('near', 3.9, 0), body('across', 4.1, 0), body('far', 100, 100)];
    const index = new DoodadBodyIndex(bodies);
    expect(index.near(4, 0, 1).map((b) => b.id).sort()).toEqual(['across', 'near']);
  });

  it('costs nothing with no bodies', () => {
    const index = new DoodadBodyIndex([]);
    expect(index.size).toBe(0);
    expect(index.near(0, 0, 100)).toEqual([]);
  });
});
