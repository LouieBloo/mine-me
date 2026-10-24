import { describe, it, expect } from 'vitest';
import { MiningTileType, type MiningClientTile } from '@mine-me/shared';
import { DoodadBodyTracker, PLAYER_BODY_RADIUS, TELEPORT_CELLS, collectBodySamples, gridWanderTerrain } from './DoodadBodies';

describe('DoodadBodyTracker', () => {
  it('takes a velocity the source reports', () => {
    const index = new DoodadBodyTracker().update(1 / 60, [{ id: 'self', x: 5, y: 5, vx: 3, vy: -1 }]);
    const [body] = index.near(5, 5, 1);
    expect([body.vx, body.vy]).toEqual([3, -1]);
    expect(body.radius).toBe(PLAYER_BODY_RADIUS);
  });

  it('works out a velocity from movement for a source that has none, and has none the first frame', () => {
    const tracker = new DoodadBodyTracker();
    expect(tracker.update(1 / 60, [{ id: 'mob:1', x: 0, y: 0 }]).near(0, 0, 1)[0].vx).toBe(0);
    let vx = 0;
    for (let i = 1; i <= 30; i++) vx = tracker.update(1 / 60, [{ id: 'mob:1', x: i * (4 / 60), y: 0 }]).near(i * (4 / 60), 0, 1)[0].vx;
    expect(vx).toBeCloseTo(4, 0);
  });

  it('counts a jump as being moved, not walked', () => {
    const tracker = new DoodadBodyTracker();
    tracker.update(1 / 60, [{ id: 'mob:1', x: 0, y: 0 }]);
    const [body] = tracker.update(1 / 60, [{ id: 'mob:1', x: TELEPORT_CELLS + 5, y: 0 }]).near(TELEPORT_CELLS + 5, 0, 1);
    expect(body.vx).toBe(0);
  });

  it('forgets a body that is gone, so one with the same id coming back starts still', () => {
    const tracker = new DoodadBodyTracker();
    tracker.update(1 / 60, [{ id: 'mob:1', x: 0, y: 0 }]);
    tracker.update(1 / 60, []);
    expect(tracker.update(1 / 60, [{ id: 'mob:1', x: 1, y: 0 }]).near(1, 0, 1)[0].vx).toBe(0);
  });

  it('is empty with no bodies', () => {
    expect(new DoodadBodyTracker().update(1 / 60, []).size).toBe(0);
  });
});

describe('collectBodySamples', () => {
  it('gathers the player, the remote players and the mobs under their own ids, with a mob\'s own size', () => {
    const samples = collectBodySamples(
      { x: 1, y: 2, vx: 3, vy: 0 },
      [{ characterId: 'abc', currentPos: { x: 4, y: 5 } }],
      [{ id: 'm1', currentPos: { x: 6, y: 7 }, colliderWidth: 3 }, { id: 'm2', currentPos: { x: 8, y: 9 } }]
    );
    expect(samples.map((s) => s.id)).toEqual(['self', 'player:abc', 'mob:m1', 'mob:m2']);
    expect(samples[2].radius).toBe(1.5);
    expect(samples[3].radius).toBeUndefined();
  });
  it('copes with nothing at all', () => {
    expect(collectBodySamples(null, null, undefined)).toEqual([]);
  });
});

describe('gridWanderTerrain', () => {
  const tile = (type: MiningTileType, revealed = true): MiningClientTile => ({ type, revealed });
  it('blocks solid blocks, unseen cells and anything off the map, and nothing else', () => {
    const grid = [[tile(MiningTileType.EMPTY), tile(MiningTileType.DIRT), tile(MiningTileType.EMPTY, false)]];
    const terrain = gridWanderTerrain(() => grid);
    expect(terrain.isSolid(0, 0)).toBe(false);
    expect(terrain.isSolid(1, 0)).toBe(true);
    expect(terrain.isSolid(2, 0)).toBe(true);
    expect(terrain.isSolid(9, 0)).toBe(true);
    expect(terrain.isSolid(0, 9)).toBe(true);
  });
  it('reads the grid as it is now (it is replaced as the map changes)', () => {
    let grid: MiningClientTile[][] = [[tile(MiningTileType.EMPTY)]];
    const terrain = gridWanderTerrain(() => grid);
    expect(terrain.isSolid(0, 0)).toBe(false);
    grid = [[tile(MiningTileType.DIRT)]];
    expect(terrain.isSolid(0, 0)).toBe(true);
    expect(gridWanderTerrain(() => null).isSolid(0, 0)).toBe(true);
  });
});
