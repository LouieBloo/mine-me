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
    expect(sub.takeChanges()).toEqual({ added: [[0, 2, 2, 0]], removed: [] });
    expect(sub.removeAt(2, 2)).toBe(true);
    expect(sub.removeAt(2, 2)).toBe(false);
    expect(sub.takeChanges()).toEqual({ added: [], removed: [[2, 2]] });
  });

  it('tells both when one is added and removed in the same tick, since a client that joined in between has it (clients apply additions first)', () => {
    const sub = new MiningDoodadSubsystem(worldOf(grid(10, 10, true)), [def('a')]);
    sub.add({ typeIndex: 0, x: 2, y: 2, variant: 0, flip: false });
    sub.removeAt(2, 2);
    expect(sub.takeChanges()).toEqual({ added: [[0, 2, 2, 0]], removed: [[2, 2]] });
  });

  it('does not send an unrevealed doodad when added by hand', () => {
    const sub = new MiningDoodadSubsystem(worldOf(grid(10, 10, false)), [def('a')]);
    sub.add({ typeIndex: 0, x: 2, y: 2, variant: 0, flip: false });
    expect(sub.takeChanges().added).toEqual([]);
    expect(sub.visibleSnapshot()).toBeUndefined();
  });
});
