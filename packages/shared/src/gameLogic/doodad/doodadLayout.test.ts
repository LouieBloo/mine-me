import { describe, it, expect } from 'vitest';
import { doodadBasePoint, doodadPartsBounds, layoutDoodad, layoutDoodadParts } from './doodadLayout';
import type { DoodadPartDef } from '../../types/doodad';

const T = 21;
const foot = { x: 10, y: 20, width: 3, height: 2 };

describe('layoutDoodad', () => {
  it('stands a FLOOR doodad on the bottom edge, in the middle', () => {
    const l = layoutDoodad('FLOOR', foot, { width: 64, height: 64 }, false, T);
    expect(l.anchorX).toBe(10 * T + 1.5 * T);
    expect(l.anchorY).toBe(22 * T);
    expect([l.originX, l.originY]).toEqual([0.5, 1]);
    // Fitted inside the footprint with its aspect kept: the height (2 cells) is the limit
    expect(l.drawWidth).toBe(2 * T);
    expect(l.drawHeight).toBe(2 * T);
  });

  it('hangs a CEILING doodad from the top edge', () => {
    const l = layoutDoodad('CEILING', foot, { width: 30, height: 10 }, false, T);
    expect(l.anchorY).toBe(20 * T);
    expect(l.originY).toBe(0);
    expect(l.drawWidth).toBe(3 * T); // the wide picture is limited by the width
    expect(l.drawHeight).toBeCloseTo(T);
  });

  it('puts a WALL doodad on its wall edge, and mirrors it (hanging off the right edge) when the wall is on the right', () => {
    const left = layoutDoodad('WALL', foot, { width: 10, height: 10 }, false, T);
    expect([left.anchorX, left.anchorY, left.mirror]).toEqual([10 * T, 21 * T, 1]);
    const right = layoutDoodad('WALL', foot, { width: 10, height: 10 }, true, T);
    expect([right.anchorX, right.anchorY, right.mirror]).toEqual([13 * T, 21 * T, -1]);
    // Only wall doodads mirror
    expect(layoutDoodad('FLOOR', foot, { width: 10, height: 10 }, true, T).mirror).toBe(1);
  });

  it('centres an AIR doodad', () => {
    const l = layoutDoodad('AIR', foot, { width: 5, height: 5 }, false, T);
    expect([l.anchorX, l.anchorY]).toEqual([11.5 * T, 21 * T]);
    expect(doodadBasePoint('AIR')).toEqual({ x: 0.5, y: 0.5 });
  });
});

describe('layoutDoodadParts', () => {
  // A mushroom: a stem 10 wide and 20 tall standing on the anchor (its pivot is at its bottom), a cap 30 wide on top of it
  const stem: DoodadPartDef = { name: 'stem', file: '/assets/a.png', width: 10, height: 20, pivot_anchor: [5, 20], offset_from_anchor: [0, 0], z_index: 0 };
  const cap: DoodadPartDef = { name: 'cap', file: '/assets/b.png', width: 30, height: 12, pivot_anchor: [15, 12], offset_from_anchor: [0, -18], z_index: 1 };

  it('finds the box that holds the parts', () => {
    expect(doodadPartsBounds([stem, cap])).toEqual({ left: -15, top: -30, right: 15, bottom: 0 });
  });

  it('fits the parts as one picture and keeps each part in its place', () => {
    const { layout, scale, parts } = layoutDoodadParts('FLOOR', { x: 0, y: 0, width: 2, height: 2 }, [stem, cap], false, T);
    // 30 x 30 picture in a 42 x 42 footprint
    expect(scale).toBeCloseTo(42 / 30);
    expect(layout.anchorX).toBe(T);
    expect(layout.anchorY).toBe(2 * T);
    const [s, c] = parts;
    expect(s.x).toBeCloseTo(T); // the stem's pivot sits on the base point
    expect(s.y).toBeCloseTo(2 * T);
    expect(c.y).toBeCloseTo(2 * T - 18 * scale);
    expect(c.pivotX).toBe(0.5);
    expect(c.pivotY).toBe(1);
    expect(c.width).toBeCloseTo(30 * scale);
    expect(c.zIndex).toBe(1);
  });

  it('mirrors the parts of a wall doodad whose wall is on the right', () => {
    const arm: DoodadPartDef = { ...stem, name: 'arm', offset_from_anchor: [0, 0], pivot_anchor: [0, 10], width: 20, height: 20 };
    const plain = layoutDoodadParts('WALL', { x: 0, y: 0, width: 2, height: 2 }, [arm, { ...arm, name: 'tip', offset_from_anchor: [16, 0] }], false, T);
    const mirrored = layoutDoodadParts('WALL', { x: 0, y: 0, width: 2, height: 2 }, [arm, { ...arm, name: 'tip', offset_from_anchor: [16, 0] }], true, T);
    const dx = (r: typeof plain) => r.parts[1].x - r.parts[0].x;
    expect(dx(mirrored)).toBeCloseTo(-dx(plain));
  });
});
