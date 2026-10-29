import { describe, it, expect, beforeEach } from 'vitest';
import { clampPanelPosition, readSavedPosition } from './useDraggablePanel';

const panel = { width: 256, height: 300 };
const container = { width: 1000, height: 700 };

describe('clampPanelPosition', () => {
  it('leaves a position inside the container alone', () => {
    expect(clampPanelPosition({ left: 100, top: 50 }, panel, container)).toEqual({ left: 100, top: 50 });
  });

  it('never lets the panel leave so far that it cannot be grabbed again', () => {
    const far = clampPanelPosition({ left: 5000, top: 5000 }, panel, container);
    expect(far.left).toBeLessThan(container.width);
    expect(far.top).toBeLessThan(container.height);
    const back = clampPanelPosition({ left: -5000, top: -5000 }, panel, container);
    expect(back.left + panel.width).toBeGreaterThan(0);
    expect(back.top).toBe(0);
  });
});

describe('readSavedPosition', () => {
  beforeEach(() => localStorage.clear());

  it('is null when nothing (or something odd) is saved', () => {
    expect(readSavedPosition('k')).toBeNull();
    localStorage.setItem('k', 'not json');
    expect(readSavedPosition('k')).toBeNull();
    localStorage.setItem('k', JSON.stringify({ left: 'x', top: 1 }));
    expect(readSavedPosition('k')).toBeNull();
  });

  it('returns a saved position', () => {
    localStorage.setItem('k', JSON.stringify({ left: 12, top: 34 }));
    expect(readSavedPosition('k')).toEqual({ left: 12, top: 34 });
  });
});
