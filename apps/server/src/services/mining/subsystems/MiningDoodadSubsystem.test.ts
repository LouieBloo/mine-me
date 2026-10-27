import { describe, it, expect } from 'vitest';
import { MiningTileType, type DoodadDefinition } from '@mine-me/shared';
import { MiningDoodadSubsystem } from './MiningDoodadSubsystem';
import type { MiningWorld } from '../MiningWorld';

const def = (key: string, over: Partial<DoodadDefinition> = {}): DoodadDefinition => ({ id: key, key, name: key, anchor: 'FLOOR', width: 1, height: 1, zOffset: 0, biomes: [], ...over });
const grid = (w: number, h: number, revealed: boolean) => Array.from({ length: h }, () => Array.from({ length: w }, () => ({ type: MiningTileType.EMPTY, revealed })));
const worldOf = (g: ReturnType<typeof grid>) => ({ grid: g }) as unknown as MiningWorld;

describe('MiningDoodadSubsystem', () => {
  it('orders kinds by key so a placement means the same thing everywhere', () => {
    const sub = new MiningDoodadSubsystem(worldOf(grid(10, 10, true)), [def('zeta'), def('alpha')]);
    expect(sub.definitions.map((d) => d.key)).toEqual(['alpha', 'zeta']);
    expect(sub.clientDefinitions()?.map((d) => [d.index, d.key])).toEqual([[0, 'alpha'], [1, 'zeta']]);
    expect(new MiningDoodadSubsystem(worldOf(grid(10, 10, true)), []).clientDefinitions()).toBeUndefined();
  });

  it('supports size variants: a big placement covers its whole footprint and is crushed by a block anywhere in it', () => {
    const big = def('big', { width: 2, height: 2, sizeVariants: [{ width: 1, height: 1, weight: 1 }, { width: 2, height: 2, weight: 1 }] });
    const sub = new MiningDoodadSubsystem(worldOf(grid(10, 10, true)), [big], [{ typeIndex: 0, x: 3, y: 3, variant: 1, flip: false }]);
    sub.onTileChanged(4, 4, MiningTileType.ROCK); // the far corner of the footprint
    expect(sub.count).toBe(0);
  });

  it('keeps a doodad whose footprint gets a ladder, torch or bridge', () => {
    const sub = new MiningDoodadSubsystem(worldOf(grid(10, 10, true)), [def('a')], [{ typeIndex: 0, x: 3, y: 3, variant: 0, flip: false }]);
    for (const t of [MiningTileType.LADDER, MiningTileType.TORCH, MiningTileType.BRIDGE]) sub.onTileChanged(3, 3, t);
    expect(sub.count).toBe(1);
  });

  it('refuses to add one on top of another, and the sandbox hook adds and removes with deltas', () => {
    const sub = new MiningDoodadSubsystem(worldOf(grid(10, 10, true)), [def('a')]);
    expect(sub.add({ typeIndex: 0, x: 2, y: 2, variant: 0, flip: false })).toBe(true);
    expect(sub.add({ typeIndex: 0, x: 2, y: 2, variant: 0, flip: false })).toBe(false);
    expect(sub.add({ typeIndex: 9, x: 5, y: 5, variant: 0, flip: false })).toBe(false);
    expect(sub.takeChanges()).toEqual({ added: [[0, 2, 2, 0]], removed: [], hit: [], killed: [] });
    expect(sub.removeAt(2, 2)).toBe(true);
    expect(sub.removeAt(2, 2)).toBe(false);
    expect(sub.takeChanges()).toEqual({ added: [], removed: [[2, 2]], hit: [], killed: [] });
  });

  it('tells both when one is added and removed in the same tick, since a client that joined in between has it (clients apply additions first)', () => {
    const sub = new MiningDoodadSubsystem(worldOf(grid(10, 10, true)), [def('a')]);
    sub.add({ typeIndex: 0, x: 2, y: 2, variant: 0, flip: false });
    sub.removeAt(2, 2);
    expect(sub.takeChanges()).toEqual({ added: [[0, 2, 2, 0]], removed: [[2, 2]], hit: [], killed: [] });
  });

  it('does not send an unrevealed doodad when added by hand', () => {
    const sub = new MiningDoodadSubsystem(worldOf(grid(10, 10, false)), [def('a')]);
    sub.add({ typeIndex: 0, x: 2, y: 2, variant: 0, flip: false });
    expect(sub.takeChanges().added).toEqual([]);
    expect(sub.visibleSnapshot()).toBeUndefined();
  });
});

describe('MiningDoodadSubsystem hurting doodads (ticket 143)', () => {
  const bug = def('bug', { width: 2, height: 2, health: 10 });
  const crawler = def('crawler', { width: 2, height: 2, health: 10, wander: { mode: 'CRAWL', radius: 4, speed: 1, pauseMs: 100 } });
  const moss = def('moss');
  const make = (defs: DoodadDefinition[], placements: Array<{ typeIndex: number; x: number; y: number }>) =>
    new MiningDoodadSubsystem(worldOf(grid(30, 30, true)), defs, placements.map((p) => ({ ...p, variant: 0, flip: false })));

  it('only lists the doodads that have health as targets, in the middle of their box', () => {
    const sub = make([bug, moss], [{ typeIndex: 0, x: 4, y: 4 }, { typeIndex: 1, x: 10, y: 4 }]);
    expect(sub.hurtableTargets()).toEqual([{ id: '4,4', x: 5, y: 5 }]);
    expect(sub.hurtableCovering(5, 5)?.id).toBe('4,4');
    expect(sub.hurtableCovering(10, 4)).toBeUndefined();
  });

  it('finds the hurtable doodads a box overlaps, and not ones it only touches', () => {
    const sub = make([bug], [{ typeIndex: 0, x: 4, y: 4 }]);
    expect(sub.hurtableInBox({ x0: 5, y0: 5, x1: 8, y1: 8 })).toHaveLength(1);
    expect(sub.hurtableInBox({ x0: 6, y0: 4, x1: 9, y1: 6 })).toHaveLength(0);
  });

  it('lets a bug that wanders be hit anywhere it may stray to', () => {
    const sub = make([crawler], [{ typeIndex: 0, x: 10, y: 10 }]);
    expect(sub.hurtableInBox({ x0: 14.5, y0: 10, x1: 15, y1: 11 })).toHaveLength(1);
    expect(sub.hurtableInBox({ x0: 16.5, y0: 10, x1: 17, y1: 11 })).toHaveLength(0);
  });

  it('finds what a bullet path touches, nearest first, with a radius for the bullet', () => {
    const sub = make([bug], [{ typeIndex: 0, x: 4, y: 4 }, { typeIndex: 0, x: 12, y: 4 }]);
    const along = sub.hurtableAlong({ x: 0, y: 5 }, { x: 20, y: 5 }, 0.1);
    expect(along.map((t) => t.id)).toEqual(['4,4', '12,4']);
    expect(along[0].t).toBeLessThan(along[1].t);
    expect(sub.hurtableAlong({ x: 0, y: 8 }, { x: 20, y: 8 }, 0.1)).toHaveLength(0);
    expect(sub.hurtableAlong({ x: 0, y: 6.3 }, { x: 20, y: 6.3 }, 0.5)).toHaveLength(2);
  });

  it('measures the distance to the nearest edge of the box', () => {
    const sub = make([bug], [{ typeIndex: 0, x: 4, y: 4 }]);
    expect(sub.distanceTo('4,4', 5, 5)).toBe(0);
    expect(sub.distanceTo('4,4', 9, 5)).toBe(3);
    expect(sub.distanceTo('nope', 9, 5)).toBe(Infinity);
  });

  it('takes health off, keeps the dealt amount to what was left, and reports the kill once', () => {
    const sub = make([bug], [{ typeIndex: 0, x: 4, y: 4 }]);
    sub.visibleSnapshot();
    expect(sub.applyHit('4,4', 4)).toEqual({ applied: true, dealt: 4, killed: false });
    expect(sub.healthAt(4, 4)).toBe(6);
    expect(sub.applyHit('4,4', 50)).toEqual({ applied: true, dealt: 6, killed: true });
    expect(sub.applyHit('4,4', 5)).toMatchObject({ applied: false });
    expect(sub.count).toBe(0);
    expect(sub.takeChanges()).toMatchObject({ hit: [[4, 4]], killed: [[4, 4]], removed: [[4, 4]] });
  });

  it('does not let a hit on a doodad with no health do anything', () => {
    const sub = make([moss], [{ typeIndex: 0, x: 4, y: 4 }]);
    expect(sub.applyHit('4,4', 5)).toMatchObject({ applied: false });
    expect(sub.count).toBe(1);
  });

  it('drops a ceiling doodad that was killed into the air, and a floor one not', () => {
    const hanging = def('hanging', { anchor: 'CEILING', health: 5 });
    const sub = make([hanging, bug], [{ typeIndex: 1, x: 4, y: 4 }, { typeIndex: 0, x: 10, y: 10 }]); // (kinds are ordered by key: bug is 0)
    sub.applyHit('4,4', 9);
    expect(sub.falling.list).toHaveLength(1);
    sub.applyHit('10,10', 99);
    expect(sub.falling.list).toHaveLength(1);
  });
});

