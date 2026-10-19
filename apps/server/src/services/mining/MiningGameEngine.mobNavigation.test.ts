import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MiningTileType } from '@mine-me/shared';
import { MiningGameEngine } from './MiningGameEngine';
import { mobEffects } from './testHelpers';

/**
 * A mole-sized mob is 1.9 cells wide and is planned for a 2-cell footprint, so it has only 0.05 to spare each side. It
 * has to line up exactly to drop down a 2-wide well, jump straight up under a low ceiling, and so on.
 */
describe('mobs find their way around the mine', () => {
  const cid = 'p1';
  const FLOOR = 40; // the first solid row of the cave floor
  let engine: MiningGameEngine;
  const tick = (n = 1) => { for (let i = 0; i < n; i++) (engine as any).tick(1 / 30); };
  const me = () => engine.players.get(cid)!;

  const set = (x: number, y: number, solid: boolean) => {
    engine.grid[y][x] = { type: solid ? MiningTileType.DIRT : MiningTileType.EMPTY, revealed: true };
    if (solid) engine.rigidWorld.addTileCollider(x, y);
    else engine.rigidWorld.removeTileCollider(x, y);
  };

  /** A cave x 10..49, rows 28..39 open, solid floor at row 40, with `solid(x, y)` extra blocks. */
  const buildCave = (extra: (x: number, y: number) => boolean) => {
    for (let y = 26; y <= FLOOR; y++) {
      for (let x = 8; x <= 51; x++) set(x, y, y >= FLOOR || y < 28 || x < 10 || x > 49 || extra(x, y));
    }
    const fluids = engine.fluidSubsystem.grid;
    for (let y = 0; y < fluids.height; y++) for (let x = 0; x < fluids.width; x++) fluids.setCell(x, y, 0, 0);
    me().godMode = true;
    me().playerBody.isGrounded = true;
  };

  const spawn = (x: number, feetY: number, data: Record<string, unknown> = {}) =>
    engine.spawnMob(
      {
        id: 'mole-ish', name: 'Mole-ish', health: 100,
        mobEffects: mobEffects({ weaponDamage: 0, toolDamage: 100, miningSpeed: 100 }),
        aiConfig: { aggroRange: 80, canMine: false, mineRange: 5, attackRange: 2.5 },
        moveSpeed: 6, jumpForce: 25.5,
        ...data,
      },
      { x, y: feetY },
    );

  beforeEach(() => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    engine = new MiningGameEngine({ characterId: cid, cityId: 'c', seed: 3, mapConfig: { mobSpawnCount: 0 }, socket: { connected: true, emit: vi.fn() } as any });
    for (const id of [...engine.activeMobs.keys()]) engine.activeMobs.delete(id);
  });

  it('drops down a well exactly its own width, instead of stopping a hair short of the edge', () => {
    // Two towers (x 10..13 and 16..19, rows 34..39) with a 2-wide well between them (x 14 and 15)
    buildCave((x, y) => y >= 34 && ((x >= 10 && x <= 13) || (x >= 16 && x <= 19)));
    me().playerBody.position = { x: 15.0, y: FLOOR - me().playerBody.halfHeight };
    const mob = spawn(11.5, 34);
    tick(30 * 15);
    // It is down in the well with the player, not left standing on the tower
    expect(mob.mobBody.position.y).toBeGreaterThan(36);
    expect(Math.abs(mob.mobBody.position.x - 15)).toBeLessThan(2.5);
  });

  it('jumps straight up out of a 2-wide, 3-deep well', () => {
    // A 2-wide well, 3 deep: the mob is at the bottom and the player stands on the right-hand tower
    buildCave((x, y) => y >= 37 && ((x >= 10 && x <= 13) || (x >= 16 && x <= 19)));
    me().playerBody.position = { x: 18, y: 37 - me().playerBody.halfHeight };
    const mob = spawn(15.0, FLOOR);
    tick(30 * 15);
    expect(mob.mobBody.position.y).toBeLessThan(37); // out and on the tower, not still in the well
  });

  it('a mob at the very bottom edge of the map can still jump (it is standing, not falling)', () => {
    const rows = engine.grid.length;
    // Clear the bottom rows so the map edge is the floor
    for (let y = rows - 6; y < rows; y++) for (let x = 8; x <= 40; x++) set(x, y, false);
    const mob = spawn(20, rows - 2);
    me().playerBody.position = { x: 30, y: rows - 1 - me().playerBody.halfHeight };
    me().godMode = true;
    tick(30 * 3);
    expect(mob.mobBody.isGrounded).toBe(true);
  });
});
