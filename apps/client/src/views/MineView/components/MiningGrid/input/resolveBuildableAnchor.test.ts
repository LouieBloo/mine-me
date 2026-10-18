import { describe, it, expect } from 'vitest';
import { BLOCK_SCALE, MiningTileType, getTileFootprint, type MiningClientTile } from '@mine-me/shared';
import { BridgePlacementAction, LadderPlacementAction, TorchPlacementAction, resolveBuildableAnchor } from './MouseAction';

const S = BLOCK_SCALE;
const half = Math.floor(S / 2);
const REACH = 100;

const roomGrid = (): MiningClientTile[][] =>
  Array.from({ length: 30 }, () => Array.from({ length: 30 }, () => ({ type: MiningTileType.EMPTY, revealed: true })));
const solid = (grid: MiningClientTile[][], x: number, y: number) => { grid[y][x] = { type: MiningTileType.DIRT, revealed: true }; };

describe('resolveBuildableAnchor', () => {
  const player = { x: 15.5, y: 15.5 };

  it('centres the piece on the cursor when it fits', () => {
    expect(resolveBuildableAnchor(MiningTileType.LADDER, { x: 10, y: 10 }, player, roomGrid(), REACH, false)).toEqual({ x: 10 - half, y: 10 - half });
  });

  it('nudges to the nearest spot that fits, still covering the cursor cell', () => {
    const grid = roomGrid();
    for (let y = 0; y < 30; y++) solid(grid, 9, y); // a wall left of the cursor column
    const anchor = resolveBuildableAnchor(MiningTileType.TORCH, { x: 10, y: 10 }, player, grid, REACH, false)!;
    expect(anchor.x).toBe(10);
    expect(anchor.x <= 10 && 10 < anchor.x + S).toBe(true);
  });

  it('refuses when no spot is wholly empty, uncovered and on the map', () => {
    const grid = roomGrid();
    for (let y = 0; y < 30; y++) for (let x = 0; x < 30; x++) if (Math.abs(x - 10) > 0) solid(grid, x, y); // a one-cell-wide slot
    expect(resolveBuildableAnchor(MiningTileType.LADDER, { x: 10, y: 10 }, player, grid, REACH, false)).toBe(null);
    const fog = roomGrid();
    fog[10][10].revealed = false;
    expect(resolveBuildableAnchor(MiningTileType.LADDER, { x: 10, y: 10 }, player, fog, REACH, false)).toBe(null);
    expect(resolveBuildableAnchor(MiningTileType.LADDER, { x: 0, y: 0 }, player, roomGrid(), REACH, false)).not.toBe(null); // nudged inside the map
    expect(resolveBuildableAnchor(MiningTileType.LADDER, { x: -1, y: 5 }, player, roomGrid(), REACH, false)).toBe(null);
  });

  it('measures reach to the piece\'s middle', () => {
    const grid = roomGrid();
    const anchor = { x: 10 - half, y: 10 - half };
    const middle = { x: anchor.x + S / 2, y: anchor.y + S / 2 };
    expect(resolveBuildableAnchor(MiningTileType.LADDER, { x: 10, y: 10 }, { x: middle.x + 5, y: middle.y }, grid, 5, false)).toEqual(anchor);
    expect(resolveBuildableAnchor(MiningTileType.LADDER, { x: 10, y: 10 }, { x: middle.x + 5.1, y: middle.y }, grid, 5, false)).toBe(null);
  });

  it('keeps solid pieces off the player', () => {
    const grid = roomGrid();
    const onPlayer = { x: 10.5, y: 10.5 };
    expect(resolveBuildableAnchor(MiningTileType.BRIDGE, { x: 10, y: 10 }, onPlayer, grid, REACH, true)).toBe(null);
    expect(resolveBuildableAnchor(MiningTileType.LADDER, { x: 10, y: 10 }, onPlayer, grid, REACH, false)).not.toBe(null);
  });
});

describe('placement reticles cover the whole piece', () => {
  const grid = roomGrid();
  const player = { x: 15.5, y: 15.5 };
  const actions = [
    () => new LadderPlacementAction(() => true),
    () => new TorchPlacementAction(() => true),
    () => new BridgePlacementAction(() => true),
  ];

  it.each(actions.map((make) => [make().name, make] as const))('%s: green over the area it would fill, red (still full size) when it cannot go', (_name, make) => {
    const action = make();
    const footprint = getTileFootprint(action.buildableType);
    const ok = action.getReticleStyle({ x: 12, y: 12 }, player, grid);
    expect(ok.isValid).toBe(true);
    expect(ok.pieceArea).toEqual({ x: 12 - half, y: 12 - half, ...footprint });

    const bad = action.getReticleStyle({ x: -1, y: 5 }, player, grid);
    expect(bad.isValid).toBe(false);
    expect(bad.pieceArea).toMatchObject(footprint);
  });
});
