import { describe, it, expect } from 'vitest';
import { DEFAULT_SKY_ROWS, MINING_CONFIG, MiningTileType, isOnEntrance } from '@mine-me/shared';
import { MiningGameEngine } from './MiningGameEngine';
import { addSkyRows, type BuiltMap } from './mapSources';

const tile = (type: MiningTileType) => ({ type, revealed: false });
const small = (): BuiltMap => ({
  grid: [[tile(MiningTileType.DIRT), tile(MiningTileType.DIRT)], [tile(MiningTileType.ROCK), tile(MiningTileType.EMPTY)]],
  fluidCells: [{ x: 1, y: 1, typeKey: 'water', level: 1 }],
  gasCells: [{ x: 0, y: 1, typeKey: 'hydrogen', concentration: 1 }],
});

describe('addSkyRows', () => {
  it('puts open, revealed air on top and moves the ground down to surfaceRow', () => {
    const built = addSkyRows(small(), 3);
    expect(built.grid).toHaveLength(5);
    for (let y = 0; y < 3; y++) for (const t of built.grid[y]) expect(t).toEqual({ type: MiningTileType.EMPTY, revealed: true });
    expect(built.grid[3][0].type).toBe(MiningTileType.DIRT);
    expect(built.grid[4][0].type).toBe(MiningTileType.ROCK);
    expect(built.surfaceRow).toBe(3);
  });

  it('moves fluid, gas and mob positions with the ground', () => {
    const built = addSkyRows({ ...small(), mobs: [{ mobId: 'm', x: 1, y: 1 } as any] }, 3);
    expect(built.fluidCells[0].y).toBe(4);
    expect(built.gasCells![0].y).toBe(4);
    expect((built.mobs![0] as any).y).toBe(4);
  });

  it('zero rows leaves the map as it was', () => {
    const built = addSkyRows(small(), 0);
    expect(built.grid).toHaveLength(2);
    expect(built.surfaceRow).toBe(0);
  });

  it('stacks on a map that already has sky', () => {
    expect(addSkyRows({ ...small(), surfaceRow: 2 }, 3).surfaceRow).toBe(5);
  });
});

describe('the generated mine with sky', () => {
  const make = (mapConfig: object = {}) =>
    new MiningGameEngine({ characterId: 'sky', cityId: 'c', seed: 9, mapConfig: { mobSpawnCount: 0, ...mapConfig }, socket: { connected: true, emit: () => {} } as any });

  it('defaults to about one screen of sky and takes the height from the map config', () => {
    expect(make().surfaceRow).toBe(DEFAULT_SKY_ROWS);
    expect(make({ skyRows: 10 }).surfaceRow).toBe(10);
    expect(make({ skyRows: 0 }).surfaceRow).toBe(0);
  });

  it('keeps the sky empty and the ground solid underneath it', () => {
    const e = make({ skyRows: 10 });
    for (let y = 0; y < 10; y++) for (let x = 0; x < e.grid[0].length; x++) expect(e.grid[y][x].type).toBe(MiningTileType.EMPTY);
    for (let x = 0; x < e.grid[0].length; x++) expect(e.grid[10][x].type).toBe(MiningTileType.DIRT);
  });

  it('starts the player on the ground and the exit is measured from surfaceRow', () => {
    const e = make({ skyRows: 10 });
    const body = e.players.get('sky')!.playerBody;
    expect(body.position.y).toBe(10 + MINING_CONFIG.ENTRANCE_Y);
    expect(isOnEntrance(body.position.x, body.position.y, e.surfaceRow)).toBe(true);
    // the same spot measured as if row 0 were the ground is nowhere near the exit
    expect(isOnEntrance(body.position.x, body.position.y, 0)).toBe(false);
  });

  it('counts mob spawn depth from the ground, not from the top of the map', () => {
    const e = make({ skyRows: 30 });
    for (let i = 0; i < 20; i++) {
      const pos = e.findValidCavernSpawnPosition(12);
      expect(pos.y).toBeGreaterThanOrEqual(30 + 12);
    }
  });

  it('puts the surface dummy on the ground', () => {
    const e = new MiningGameEngine({ characterId: 'sky', cityId: 'c', seed: 9, mapConfig: { mobSpawnCount: 0, skyRows: 10, surfaceDummyMobId: 'mob_target_dummy' }, socket: { connected: true, emit: () => {} } as any });
    const dummy = e.getActiveMobs().find((m) => m.mobId === 'mob_target_dummy');
    expect(dummy).toBeDefined();
    // stands on the ground (a few rows of body above the surface row), not at the top of the map
    expect(dummy!.position.y).toBeGreaterThan(10 - 5);
    expect(dummy!.position.y).toBeLessThanOrEqual(10 + 1);
  });
});
