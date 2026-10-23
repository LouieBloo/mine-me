import { describe, it, expect, vi } from 'vitest';
import { MiningGameEngine } from './MiningGameEngine';
import { MiningTileType } from '@mine-me/shared';

describe('a mine with a non-default grid size', () => {
  const start = () => {
    const socket = { connected: true, emit: vi.fn() };
    const engine = new MiningGameEngine({
      characterId: 'small', cityId: 'c', seed: 3, socket: socket as any, maxHealth: 100,
      mapConfig: { gridWidth: 30, gridHeight: 30, mobSpawnCount: 0 },
    });
    return engine;
  };
  const tick = (e: MiningGameEngine, n = 1) => { for (let i = 0; i < n; i++) (e as any).tick(1 / 30); };

  it('builds the grid at the configured size', () => {
    const e = start();
    // the configured size is the mine itself; the sky rows sit on top of it
    expect(e.grid).toHaveLength(30 + e.surfaceRow);
    expect(e.grid[0]).toHaveLength(30);
  });

  it('keeps the player inside the smaller grid', () => {
    const e = start();
    const me = e.players.get('small')!;
    me.playerBody.position = { x: 28, y: 0 };
    me.inputs = { ...me.inputs, right: true };
    tick(e, 120);
    expect(me.playerBody.position.x).toBeLessThanOrEqual(30);
  });

  it('lands a falling rock on the floor of the smaller grid', () => {
    const e = start();
    for (let y = 1; y < 30; y++) e.grid[y][10] = { type: MiningTileType.EMPTY, revealed: true };
    e.grid[0][10] = { type: MiningTileType.ROCK, revealed: true };
    // Gravity resolution must not read past row 29
    expect(() => tick(e, 30)).not.toThrow();
  });
});
