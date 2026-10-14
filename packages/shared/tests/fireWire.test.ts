import { describe, it, expect } from 'vitest';
import { FireField } from '../src/index';

describe('FireField', () => {
  it('starts with nothing burning', () => {
    const field = new FireField(5, 4);
    expect(field.isBurning(1, 1)).toBe(false);
    expect(field.burningCount).toBe(0);
  });

  it('stores fires starting and stopping, and counts them', () => {
    const field = new FireField(5, 4);
    field.apply([[1, 1, 1], [2, 2, 1]]);
    expect(field.isBurning(1, 1)).toBe(true);
    expect(field.burningCount).toBe(2);
    field.apply([[1, 1, 0]]);
    expect(field.isBurning(1, 1)).toBe(false);
    expect(field.burningCount).toBe(1);
  });

  it('reports only the cells that really changed, and does not double count', () => {
    const field = new FireField(5, 4);
    expect(field.apply([[1, 1, 1], [1, 1, 1], [3, 3, 0]])).toEqual([[1, 1, 1]]);
    expect(field.burningCount).toBe(1);
  });

  it('ignores cells outside the field and non-integer positions', () => {
    const field = new FireField(3, 3);
    expect(field.apply([[-1, 0, 1], [3, 0, 1], [0, 3, 1], [0.5, 0, 1]])).toEqual([]);
    expect(field.burningCount).toBe(0);
    expect(field.isBurning(9, 9)).toBe(false);
  });

  it('visits the burning cells', () => {
    const field = new FireField(4, 3);
    field.apply([[3, 2, 1], [0, 0, 1]]);
    const seen: string[] = [];
    field.forEachBurning((x, y) => seen.push(`${x},${y}`));
    expect(seen).toEqual(['0,0', '3,2']);
  });
});
