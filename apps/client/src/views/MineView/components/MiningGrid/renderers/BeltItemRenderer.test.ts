import { describe, it, expect, vi } from 'vitest';
import { Container } from 'pixi.js';
import type { MiningBeltItem } from '@mine-me/shared';
import { BeltItemRenderer, beltItemPosition } from './BeltItemRenderer';
import { TILE_SIZE } from './MiningTileRenderer';

const belt = { shaftX: 90, shaftWidth: 3, startRow: 24, beltSpeed: 6 };
const item = (id: string, pos: number, over: Partial<MiningBeltItem> = {}): MiningBeltItem => ({ id, itemId: 'ore', itemName: 'Ore', iconUrl: null, ownerId: 'p', pos, ...over });

describe('beltItemPosition', () => {
  it('moves up at the belt speed and never goes backwards', () => {
    expect(beltItemPosition(12, 6, 0)).toBe(12);
    expect(beltItemPosition(12, 6, 1)).toBe(6);
    expect(beltItemPosition(12, 6, -5)).toBe(12);
  });
});

describe('BeltItemRenderer', () => {
  it('adds an item where the server said it started, and each is a single view', () => {
    const r = new BeltItemRenderer(new Container(), belt);
    r.add([item('a', 10), item('b', 4)]);
    r.add([item('a', 99)]); // a repeat is ignored
    expect(r.count).toBe(2);
    expect(r.positionOf('a')).toBe(10);
    expect(r.root.children).toHaveLength(2);
  });

  it('moves items up with time, derived from the speed (nothing is sent per tick)', () => {
    const r = new BeltItemRenderer(new Container(), belt);
    r.add([item('a', 12)]);
    r.update(0.5);
    expect(r.positionOf('a')).toBeCloseTo(9);
    const view = r.root.children[0];
    expect(view.x).toBe((90 + 1.5) * TILE_SIZE);
    expect(view.y).toBeCloseTo((24 + 9) * TILE_SIZE);
  });

  it('counts an item from when the client heard of it, so a late one does not jump', () => {
    const r = new BeltItemRenderer(new Container(), belt);
    r.update(2);
    r.add([item('late', 8)]);
    expect(r.positionOf('late')).toBe(8);
    r.update(1);
    expect(r.positionOf('late')).toBeCloseTo(2);
  });

  it('hides an item that has reached the top even if the arrival message is late', () => {
    const r = new BeltItemRenderer(new Container(), belt);
    r.add([item('a', 1)]);
    r.update(1);
    expect(r.root.children[0].visible).toBe(false);
  });

  it('removes items the server says arrived or were lost, and ignores ones it does not know', () => {
    const r = new BeltItemRenderer(new Container(), belt);
    r.add([item('a', 10), item('b', 5)]);
    r.remove(['a', 'ghost']);
    expect(r.count).toBe(1);
    expect(r.positionOf('a')).toBeUndefined();
    expect(r.root.children).toHaveLength(1);
  });

  it('gives a spot on the belt in cells, for sounds', () => {
    const r = new BeltItemRenderer(new Container(), belt);
    expect(r.cellPosition(5)).toEqual({ x: 91.5, y: 29 });
  });

  it('loads an icon once per kind and survives a failed load', async () => {
    const texture = { width: 20, height: 10 } as any;
    const loader = vi.fn().mockResolvedValueOnce(texture).mockResolvedValue(null);
    const r = new BeltItemRenderer(new Container(), belt, loader);
    r.add([item('a', 10, { iconUrl: '/assets/icons/ore.png' })]);
    await Promise.resolve();
    await Promise.resolve();
    expect(loader).toHaveBeenCalledWith('/assets/icons/ore.png');
    r.add([item('b', 10, { iconUrl: '/assets/icons/bad.png' })]);
    await Promise.resolve();
    await Promise.resolve();
    expect(r.count).toBe(2);
    r.destroy();
    expect(() => r.update(1)).not.toThrow();
  });
});
