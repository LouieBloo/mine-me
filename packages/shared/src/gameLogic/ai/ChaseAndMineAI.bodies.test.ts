import { describe, it, expect } from 'vitest';
import { ChaseAndMineAI } from './ChaseAndMineAI';
import type { MobAIContext } from './BaseMobAI';
import { MiningTileType } from '../../types/mining';
import type { MiningCollisionGrid } from '../../physics/MiningPhysicsBody';

/** A grid of open air with a solid floor from row `floorY` down, and the given extra solid cells. */
const world = (floorY: number, solid: [number, number, MiningTileType?][] = []): MiningCollisionGrid => {
  const grid = Array.from({ length: 40 }, (_, y) => Array.from({ length: 60 }, (): { type: MiningTileType } => ({ type: y >= floorY ? MiningTileType.DIRT : MiningTileType.EMPTY })));
  for (const [x, y, type] of solid) grid[y][x] = { type: type ?? MiningTileType.DIRT };
  return grid as unknown as MiningCollisionGrid;
};

/** The mole's body: 1.9 x 2.67 cells, so a 2 x 3 footprint it does not quite fill. */
const BODY = { width: 1.9, height: 2.67 };
const FEET_ON = (floorY: number) => floorY - BODY.height / 2;

const context = (grid: MiningCollisionGrid, x: number, floorY: number, overrides: Partial<MobAIContext> = {}): MobAIContext => ({
  mobId: 'm', instanceId: 'i', position: { x, y: FEET_ON(floorY) }, velocity: { x: 0, y: 0 }, health: 10, maxHealth: 10, defense: 0,
  isGrounded: true, isOnLadder: false, grid, body: BODY, jumpTiles: 3,
  players: [{ characterId: 'p', position: { x: 40, y: FEET_ON(floorY) }, health: 100 }],
  config: { aggroRange: 100, attackRange: 2, mineRange: 3.3, canMine: true },
  ...overrides,
});

/** An AI that is already following `path` (it will not plan a new one for the next 10 s). */
const following = (path: { x: number; y: number; action: string; mineTarget?: { x: number; y: number } }[], target = { x: 40, y: 0 }) => {
  const ai = new ChaseAndMineAI('m', 'i') as any;
  ai.path = path;
  ai.currentWaypointIndex = 0;
  ai.pathTimer = 10;
  ai.lastTargetPos = target;
  return ai as ChaseAndMineAI;
};

describe('a body a hair narrower than its footprint', () => {
  const FLOOR = 30;
  /** The target node is where the player stands: x 40 - 1 = 39, row = floor - 1 = 29. */
  const target = { x: 39, y: FLOOR - 1 };

  it('steers all the way onto the middle of the footprint before it drops, not 0.1 short', () => {
    // Waypoint 1 is the spot to drop to, centred on x = 5.0
    const ai = following([{ x: 4, y: FLOOR - 1, action: 'FALL' }, { x: 4, y: FLOOR, action: 'FALL' }], target);
    const intent = ai.update(1 / 30, context(world(FLOOR), 5.1, FLOOR));
    expect(intent.moveX).toBeLessThan(0);
    expect(intent.moveX).toBeGreaterThan(-1); // slows down for the last stretch
  });

  it('does not move once it is on the middle', () => {
    const ai = following([{ x: 4, y: FLOOR - 1, action: 'FALL' }, { x: 4, y: FLOOR, action: 'FALL' }], target);
    expect(ai.update(1 / 30, context(world(FLOOR), 5.0, FLOOR)).moveX).toBe(0);
  });

  it('runs at full speed while the waypoint is more than half a cell away', () => {
    const ai = following([{ x: 4, y: FLOOR - 1, action: 'FALL' }, { x: 9, y: FLOOR - 1, action: 'FALL' }], target);
    expect(ai.update(1 / 30, context(world(FLOOR), 5.0, FLOOR)).moveX).toBe(1);
  });

  it('lines up before a jump straight up, so its head does not catch the column beside it', () => {
    const ai = following([{ x: 4, y: FLOOR - 3, action: 'JUMP' }], target);
    const off = ai.update(1 / 30, context(world(FLOOR), 5.1, FLOOR));
    expect(off.jump).toBe(false);
    expect(off.moveX).toBeLessThan(0);
    const on = following([{ x: 4, y: FLOOR - 3, action: 'JUMP' }], target).update(1 / 30, context(world(FLOOR), 5.01, FLOOR));
    expect(on.jump).toBe(true);
  });

  it('does not wait to line up before a jump that also moves sideways', () => {
    const ai = following([{ x: 5, y: FLOOR - 2, action: 'JUMP' }], target);
    expect(ai.update(1 / 30, context(world(FLOOR), 5.0, FLOOR)).jump).toBe(true);
  });
});

describe('digging', () => {
  const FLOOR = 30;
  /** A wall two cells thick and 7 high: too tall to jump, so it has to be dug (or is a dead end). */
  const wallAhead = (type: MiningTileType) =>
    world(FLOOR, [8, 9].flatMap((x) => Array.from({ length: 7 }, (_, i): [number, number, MiningTileType] => [x, FLOOR - 1 - i, type])));

  it('digs a dirt wall that is in its way', () => {
    const ai = new ChaseAndMineAI('m', 'i');
    let dug = false;
    for (let i = 0; i < 5 && !dug; i++) dug = ai.update(1 / 30, context(wallAhead(MiningTileType.DIRT), 7.0, FLOOR)).isMining;
    expect(dug).toBe(true);
  });

  it('never tries to dig a rock, which cannot be mined (it may tunnel through the dirt around it)', () => {
    const grid = wallAhead(MiningTileType.ROCK);
    const ai = new ChaseAndMineAI('m', 'i');
    for (let i = 0; i < 40; i++) {
      const intent = ai.update(1 / 30, context(grid, 7.0, FLOOR));
      if (intent.miningTarget) expect(grid[intent.miningTarget.y][intent.miningTarget.x].type).not.toBe(MiningTileType.ROCK);
    }
  });

  it('gives up a planned dig when a rock has landed on the cell it meant to dig', () => {
    // The route said "dig (8, 28)", but a falling rock has since come to rest there
    const grid = world(FLOOR, [[8, 28, MiningTileType.ROCK]]);
    const ai = following([{ x: 7, y: FLOOR - 1, action: 'MINE', mineTarget: { x: 8, y: 28 } }], { x: 39, y: FLOOR - 1 });
    expect(ai.update(1 / 30, context(grid, 7.0, FLOOR)).isMining).toBe(false);
  });

  it('does not dig a block it cannot break with its pick, even though the block can be mined', () => {
    const ai = new ChaseAndMineAI('m', 'i');
    const tooHard = context(wallAhead(MiningTileType.DIRT), 6.5, FLOOR, { canBreakTile: () => false });
    for (let i = 0; i < 40; i++) expect(ai.update(1 / 30, tooHard).isMining).toBe(false);
  });
});
