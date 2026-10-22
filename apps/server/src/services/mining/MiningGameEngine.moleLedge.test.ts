import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MiningTileType } from '@mine-me/shared';
import { MiningGameEngine } from './MiningGameEngine';
import { mobEffects } from './testHelpers';

/** A mole with a lone block in front of it: it steps over a floor-level one, mines a raised one, and only ever shows the jump pose in the air. */
describe('a mole meets a lone block on its way to the player', () => {
  const cid = 'p1';
  const FLOOR = 40;
  let engine: MiningGameEngine;
  const tick = () => (engine as any).tick(1 / 30);
  const me = () => engine.players.get(cid)!;
  const set = (x: number, y: number, solid: boolean) => {
    engine.grid[y][x] = { type: solid ? MiningTileType.DIRT : MiningTileType.EMPTY, revealed: true };
    if (solid) engine.rigidWorld.addTileCollider(x, y);
    else engine.rigidWorld.removeTileCollider(x, y);
  };

  /** A cave with a lone block `height` cells above the floor at x = 20, a mole at x = 15 and the player at x = 30. */
  const run = (height: number, canMine: boolean) => {
    for (let y = 26; y <= FLOOR; y++) for (let x = 8; x <= 51; x++) set(x, y, y >= FLOOR || y < 28 || x < 10 || x > 49);
    set(20, FLOOR - 1 - height, true);
    const fluids = engine.fluidSubsystem.grid;
    for (let y = 0; y < fluids.height; y++) for (let x = 0; x < fluids.width; x++) fluids.setCell(x, y, 0, 0);
    me().godMode = true;
    me().playerBody.position = { x: 30, y: FLOOR - me().playerBody.halfHeight };
    const mob = engine.spawnMob(
      {
        id: 'm', name: 'm', health: 100,
        mobEffects: mobEffects({ weaponDamage: 0, toolDamage: 100, miningSpeed: 100 }),
        aiConfig: { aggroRange: 80, canMine, mineRange: 5, attackRange: 2.5 },
        moveSpeed: 6, jumpForce: 25.5,
      },
      { x: 15, y: FLOOR },
    );
    let groundedJumpPoses = 0;
    let mined = false;
    for (let i = 0; i < 30 * 8; i++) {
      tick();
      if (mob.animationState === 'jump' && mob.mobBody.isGrounded) groundedJumpPoses++;
      if (engine.grid[FLOOR - 1 - height][20].type === MiningTileType.EMPTY) mined = true;
    }
    return { mob, groundedJumpPoses, mined };
  };

  beforeEach(() => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    engine = new MiningGameEngine({ characterId: cid, cityId: 'c', seed: 3, mapConfig: { mobSpawnCount: 0 }, socket: { connected: true, emit: vi.fn() } as any });
    for (const id of [...engine.activeMobs.keys()]) engine.activeMobs.delete(id);
  });

  it('steps over a floor-level block and walks off the far side without a jump pose on the ground', () => {
    const { mob, groundedJumpPoses } = run(0, true);
    expect(mob.mobBody.position.x).toBeGreaterThan(25);
    expect(groundedJumpPoses).toBe(0);
  });

  it('mines a raised block that is in its way when it can mine', () => {
    for (const height of [1, 2]) {
      engine = new MiningGameEngine({ characterId: cid, cityId: 'c', seed: 3, mapConfig: { mobSpawnCount: 0 }, socket: { connected: true, emit: vi.fn() } as any });
      for (const id of [...engine.activeMobs.keys()]) engine.activeMobs.delete(id);
      const { mined } = run(height, true);
      expect(mined).toBe(true);
    }
  });
});
