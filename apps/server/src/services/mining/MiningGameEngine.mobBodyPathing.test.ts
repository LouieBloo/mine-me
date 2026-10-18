import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MINING_CONFIG, MiningTileType } from '@mine-me/shared';
import { MiningGameEngine } from './MiningGameEngine';
import { mobEffects } from './testHelpers';

/**
 * Mobs are bodies several cells across (a default one is 1.9 x 2.7 tiles), so they have to find and dig routes their own
 * size: a door a cell tall is a wall to them, and a wall they dig through has to be opened up as wide and as tall as they are.
 */
describe('mobs that fill several cells', () => {
  const cid = 'p1';
  const FLOOR = 40; // the first solid row of the cave floor
  let engine: MiningGameEngine;
  const tick = (n = 1) => { for (let i = 0; i < n; i++) (engine as any).tick(1 / 30); };
  const me = () => engine.players.get(cid)!;

  /** A cave x 10..49, rows 30..39 open, solid floor on row 40, a wall at x 28..29 with the given rows open. */
  const buildCave = (doorRows: number[]) => {
    for (let y = 28; y <= FLOOR; y++) {
      for (let x = 8; x <= 51; x++) {
        const wall = x === 28 || x === 29;
        const solid = y >= FLOOR || y < 30 || x < 10 || x > 49 || (wall && !doorRows.includes(y));
        engine.grid[y][x] = { type: solid ? MiningTileType.DIRT : MiningTileType.EMPTY, revealed: true };
        if (solid) engine.rigidWorld.addTileCollider(x, y);
        else engine.rigidWorld.removeTileCollider(x, y);
      }
    }
    const fluids = engine.fluidSubsystem.grid;
    for (let y = 0; y < fluids.height; y++) for (let x = 0; x < fluids.width; x++) fluids.setCell(x, y, 0, 0);
    me().playerBody.position = { x: 44, y: FLOOR - me().playerBody.halfHeight };
    me().playerBody.isGrounded = true;
    me().godMode = true;
  };

  const spawnWalker = (canMine: boolean) => {
    const mob = engine.spawnMob(
      {
        id: 'walker', name: 'Walker', health: 100,
        mobEffects: mobEffects({ weaponDamage: 0, toolDamage: 100, miningSpeed: 100 }),
        aiConfig: { aggroRange: 80, canMine, mineRange: 5, attackRange: 2.5 },
        moveSpeed: 6,
      },
      { x: 18, y: FLOOR },
    );
    return mob;
  };

  beforeEach(() => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    engine = new MiningGameEngine({ characterId: cid, cityId: 'c', seed: 3, mapConfig: { mobSpawnCount: 0 }, socket: { connected: true, emit: vi.fn() } as any });
    for (const id of [...engine.activeMobs.keys()]) engine.activeMobs.delete(id);
  });

  it('walks through a door as tall as it is, without digging', () => {
    buildCave([FLOOR - 3, FLOOR - 2, FLOOR - 1]);
    const mob = spawnWalker(true);
    const wallBefore = [28, 29].map((x) => engine.grid[34][x].type);
    tick(30 * 12);
    expect(mob.mobBody.position.x).toBeGreaterThan(30);
    expect([28, 29].map((x) => engine.grid[34][x].type)).toEqual(wallBefore); // nothing was dug (rows above the door are untouched)
  });

  it('digs a gap its own size through a solid wall and comes through', () => {
    buildCave([]);
    const mob = spawnWalker(true);
    tick(30 * 30);
    expect(mob.mobBody.position.x).toBeGreaterThan(30);
    // The gap it left is as tall as its body: the cells it stood in while passing are all open
    const open = [FLOOR - 1, FLOOR - 2, FLOOR - 3].every((y) => engine.grid[y][28].type === MiningTileType.EMPTY && engine.grid[y][29].type === MiningTileType.EMPTY);
    expect(open).toBe(true);
  });

  it('a door one cell tall is a wall to it: it digs rather than squeezing through', () => {
    buildCave([FLOOR - 1]);
    const mob = spawnWalker(true);
    tick(30 * 30);
    expect(mob.mobBody.position.x).toBeGreaterThan(30);
    expect([FLOOR - 2, FLOOR - 3].every((y) => engine.grid[y][28].type === MiningTileType.EMPTY)).toBe(true); // the rows above the door were dug out
  });

  it('a mob that cannot dig stays on its side of a wall it does not fit through', () => {
    buildCave([FLOOR - 1]);
    const mob = spawnWalker(false);
    tick(30 * 20);
    expect(mob.mobBody.position.x + mob.mobBody.halfWidth).toBeLessThanOrEqual(28 + 0.01);
    expect(MINING_CONFIG.PLAYER_COLLIDER_HEIGHT_TILES).toBeGreaterThan(1.5); // (the premise: the body is taller than the door)
  });
});
