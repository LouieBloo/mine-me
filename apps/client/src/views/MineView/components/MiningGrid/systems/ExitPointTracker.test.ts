import { describe, it, expect, vi } from 'vitest';
import { MINING_CONFIG } from '@mine-me/shared';
import { ExitPointTracker } from './ExitPointTracker';

const X = MINING_CONFIG.ENTRANCE_X;

describe('ExitPointTracker', () => {
  it('reports stepping on and off the point once each, not every frame', () => {
    const seen: boolean[] = [];
    const t = new ExitPointTracker(10, (v) => seen.push(v));
    t.update(X + 40, 10);
    t.update(X, 10);
    t.update(X + 1, 10);
    t.update(X, 10);
    t.update(X + 40, 10);
    expect(seen).toEqual([true, false]);
  });

  it('measures the height from the surface row, so a run with sky above the ground still works', () => {
    const seen: boolean[] = [];
    new ExitPointTracker(30, (v) => seen.push(v)).update(X, 30);
    expect(seen).toEqual([true]);
    const none: boolean[] = [];
    new ExitPointTracker(30, (v) => none.push(v)).update(X, 0);
    expect(none).toEqual([]);
  });

  it('reset says the player left, only if they were at the point', () => {
    const onChange = vi.fn();
    const t = new ExitPointTracker(0, onChange);
    t.reset();
    expect(onChange).not.toHaveBeenCalled();
    t.update(X, 0);
    t.reset();
    expect(onChange).toHaveBeenLastCalledWith(false);
  });
});
