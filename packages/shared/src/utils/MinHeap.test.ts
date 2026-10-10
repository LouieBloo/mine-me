import { describe, it, expect } from 'vitest';
import { MinHeap } from './MinHeap';

describe('MinHeap', () => {
  it('pops in ascending priority order', () => {
    const heap = new MinHeap<string>();
    [['c', 3], ['a', 1], ['e', 5], ['b', 2], ['d', 4]].forEach(([v, p]) => heap.push(v as string, p as number));
    expect(heap.size).toBe(5);
    const out: string[] = [];
    while (heap.size) out.push(heap.pop()!);
    expect(out).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('returns undefined when empty and handles duplicates', () => {
    const heap = new MinHeap<number>();
    expect(heap.pop()).toBeUndefined();
    heap.push(1, 2);
    heap.push(2, 2);
    expect([heap.pop(), heap.pop()].sort()).toEqual([1, 2]);
  });

  it('matches a sort on random input', () => {
    const heap = new MinHeap<number>();
    const values = Array.from({ length: 500 }, (_, i) => (i * 7919) % 1000);
    values.forEach((v) => heap.push(v, v));
    const out: number[] = [];
    while (heap.size) out.push(heap.pop()!);
    expect(out).toEqual([...values].sort((a, b) => a - b));
  });
});
