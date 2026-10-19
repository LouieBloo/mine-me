import { describe, it, expect } from 'vitest';
import { BLOCK_SCALE, MINING_CONFIG, MiningTileType, isWithinMiningReach } from '../types/mining';
import { MINING_QUEUE_LENGTH, selectMiningTargets, type TargetableTile } from './miningTargeting';

const S = BLOCK_SCALE;
const REACH = MINING_CONFIG.PLAYER_MINING_REACH;

/** An open room of `size` cells; `solid` cells are dirt. */
const room = (size = 40, solid: (x: number, y: number) => boolean = () => false): TargetableTile[][] =>
  Array.from({ length: size }, (_, y) =>
    Array.from({ length: size }, (_, x) => ({ type: solid(x, y) ? MiningTileType.DIRT : MiningTileType.EMPTY, revealed: true }))
  );

const keys = (cells: { x: number; y: number }[]) => cells.map((c) => `${c.x},${c.y}`);
/** The player stands in the middle of cell (20, 20). */
const player = { x: 20.5, y: 20.5 };

describe('selectMiningTargets (auto): the face in front of the player', () => {
  it('pointing right at a wall, mines the middle block, then the top, then the bottom', () => {
    const grid = room(40, (x) => x >= 22 && x <= 24);
    expect(MINING_QUEUE_LENGTH).toBe(S);
    expect(keys(selectMiningTargets(grid, player, { x: 30, y: 20 }))).toEqual(['22,20', '22,19', '22,21']);
  });

  it('pointing left works the same, and the next face becomes the front once this one is gone', () => {
    const grid = room(40, (x) => x >= 16 && x <= 18);
    expect(keys(selectMiningTargets(grid, player, { x: 5, y: 20 }))).toEqual(['18,20', '18,19', '18,21']);
    for (const y of [19, 20, 21]) grid[y][18] = { type: MiningTileType.EMPTY, revealed: true };
    expect(keys(selectMiningTargets(grid, player, { x: 5, y: 20 }))).toEqual(['17,20', '17,19', '17,21']);
  });

  it('pointing up at a ceiling, mines the middle block, then the left, then the right', () => {
    const grid = room(40, (_x, y) => y <= 18);
    expect(keys(selectMiningTargets(grid, player, { x: 20, y: 8 }))).toEqual(['20,18', '19,18', '21,18']);
  });

  it('pointing down at the floor works the same', () => {
    const grid = room(40, (_x, y) => y >= 22);
    expect(keys(selectMiningTargets(grid, player, { x: 20, y: 35 }))).toEqual(['20,22', '19,22', '21,22']);
  });

  it('pointing diagonally, mines the diagonal block and its neighbours, and nothing behind them', () => {
    const grid = room(40, (x, y) => x + y >= 42);
    const result = selectMiningTargets(grid, player, { x: 30, y: 30 });
    expect(result[0]).toEqual({ x: 21, y: 21 });
    expect(result).toHaveLength(S);
    for (const c of result) expect(c.x + c.y).toBe(42);
  });

  it('the hovered block outranks the block being mined now', () => {
    const grid = room(40, (x) => x >= 22 && x <= 24);
    expect(keys(selectMiningTargets(grid, player, { x: 22, y: 19 }, { keep: { x: 22, y: 20 } }))[0]).toBe('22,19');
    expect(keys(selectMiningTargets(grid, player, { x: 22, y: 21 }, { keep: { x: 22, y: 19 } }))[0]).toBe('22,21');
  });

  it('starts with the block the cursor is closest to, not always the middle', () => {
    const grid = room(40, (x) => x >= 22 && x <= 24);
    expect(keys(selectMiningTargets(grid, player, { x: 22, y: 19 }))[0]).toBe('22,19');
    expect(keys(selectMiningTargets(grid, player, { x: 22, y: 21 }))[0]).toBe('22,21');
    expect(keys(selectMiningTargets(grid, player, { x: 22, y: 20 }))[0]).toBe('22,20');
  });
});

describe('selectMiningTargets (auto): direction, reach and what is in the way', () => {
  it('a cursor over a far block mines whatever is in the way, up to reach', () => {
    const grid = room(60, (x) => x >= 22);
    const far = { x: 20.5, y: 20.5 };
    const result = selectMiningTargets(grid, far, { x: 50, y: 20 });
    expect(keys(result)).toEqual(['22,20', '22,19', '22,21']);
    for (const c of result) expect(Math.abs(c.x + 0.5 - far.x)).toBeLessThanOrEqual(REACH);
  });

  it('a cursor right beside the player still mines the wall ahead along that direction', () => {
    const grid = room(40, (x) => x >= 24);
    expect(selectMiningTargets(grid, player, { x: 21, y: 20 })[0]).toEqual({ x: 24, y: 20 });
  });

  it('never picks a block behind another block', () => {
    const grid = room(40, (x) => x >= 22 && x <= 26);
    const result = keys(selectMiningTargets(grid, player, { x: 30, y: 20 }, { count: 20 }));
    expect(result.every((k) => k.startsWith('22,'))).toBe(true);
  });

  it('does not reach through a block that cannot be mined', () => {
    const grid = room(40, (x) => x >= 23);
    for (const y of [19, 20, 21]) grid[y][22] = { type: MiningTileType.ROCK, revealed: true }; // solid, not mineable
    expect(selectMiningTargets(grid, player, { x: 30, y: 20 })).toEqual([]);
  });

  it('does not reach into fog', () => {
    const grid = room(40, (x) => x >= 22);
    for (let y = 0; y < 40; y++) grid[y][22].revealed = false;
    expect(selectMiningTargets(grid, player, { x: 30, y: 20 })).toEqual([]);
  });

  it('never picks a block out of reach', () => {
    const grid = room(60, (x) => x >= 30);
    expect(selectMiningTargets(grid, player, { x: 50, y: 20 })).toEqual([]);
    const near = room(60, (x) => x >= 20 + Math.floor(REACH));
    expect(selectMiningTargets(near, player, { x: 50, y: 20 }).length).toBeGreaterThan(0);
  });

  it('takes what is in front through open air with a gap before the wall', () => {
    const grid = room(40, (x) => x >= 23);
    expect(keys(selectMiningTargets(grid, player, { x: 36, y: 20 }))).toEqual(['23,20', '23,19', '23,21']);
  });

  it('does not take blocks behind the player', () => {
    const grid = room(40, (x) => x <= 19);
    expect(selectMiningTargets(grid, player, { x: 30, y: 20 })).toEqual([]);
  });

  it('stays inside the map', () => {
    const grid = room(10, () => true);
    const result = selectMiningTargets(grid, { x: 0.5, y: 5.5 }, { x: 0, y: 5 });
    for (const c of result) {
      expect(c.x).toBeGreaterThanOrEqual(0);
      expect(c.y).toBeGreaterThanOrEqual(0);
    }
  });

  it('can be given another count and reach', () => {
    const grid = room(40, (x) => x >= 22);
    expect(selectMiningTargets(grid, player, { x: 30, y: 20 }, { count: 2 })).toHaveLength(2);
    expect(selectMiningTargets(grid, player, { x: 30, y: 20 }, { reach: 1.4 })).toEqual([]);
  });

  it('keeps the block being mined first while it is still among those lined up', () => {
    const grid = room(40, (x) => x >= 22 && x <= 24);
    const base = selectMiningTargets(grid, player, { x: 30, y: 20 });
    expect(base[0]).toEqual({ x: 22, y: 20 });
    expect(selectMiningTargets(grid, player, { x: 30, y: 20 }, { keep: { x: 22, y: 21 } })[0]).toEqual({ x: 22, y: 21 });
    expect(selectMiningTargets(grid, player, { x: 30, y: 20 }, { keep: { x: 30, y: 30 } })).toEqual(base);
  });

  it('lines up three blocks in each direction, including straight down from where the player stands', () => {
    const feet = 22;
    const floor = room(40, (_x, y) => y >= feet);
    const standing = { x: 20.5, y: feet - 1.35 };
    expect(selectMiningTargets(floor, standing, { x: 20, y: feet + 1 })).toHaveLength(3);
    const wall = room(40, (x) => x >= 22);
    expect(selectMiningTargets(wall, player, { x: 30, y: 20 })).toHaveLength(3);
    // three blocks deep straight down is within reach
    const shaft = room(40, (x, y) => y >= feet && y <= feet + 2 && x === 20);
    expect(selectMiningTargets(shaft, standing, { x: 20, y: feet + 2 }, { count: 1 })).toEqual([{ x: 20, y: feet }]);
    expect(isWithinMiningReach(0, 3 * 1 + 0.85)).toBe(true);
    expect(isWithinMiningReach(0, 4.5)).toBe(false);
  });

  it('works for a player standing on the surface, above the first row of the map', () => {
    const grid = room(40, (_x, y) => y >= 0).slice(0, 10);
    const standing = { x: 20.5, y: -1.35 };
    expect(keys(selectMiningTargets(grid, standing, { x: 20, y: 1 }))).toHaveLength(3);
    expect(keys(selectMiningTargets(grid, standing, { x: 20, y: 1 }))).toContain('20,0');
  });

  it('a block in the player\'s own cell is mined', () => {
    const grid = room(40);
    grid[20][20] = { type: MiningTileType.DIRT, revealed: true };
    expect(selectMiningTargets(grid, player, { x: 20, y: 20 })).toEqual([{ x: 20, y: 20 }]);
  });
});

describe('selectMiningTargets (precise, Ctrl)', () => {
  it('is only the cursor cell', () => {
    const grid = room(40, (x) => x >= 22);
    expect(selectMiningTargets(grid, player, { x: 24, y: 20 }, { precise: true })).toEqual([{ x: 24, y: 20 }]);
  });

  it('is empty when the cursor cell is air, out of reach, or not mineable', () => {
    const grid = room(40, (x) => x >= 22);
    expect(selectMiningTargets(grid, player, { x: 21, y: 20 }, { precise: true })).toEqual([]);
    expect(selectMiningTargets(grid, player, { x: 39, y: 20 }, { precise: true })).toEqual([]);
    grid[20][23] = { type: MiningTileType.ROCK, revealed: true };
    expect(selectMiningTargets(grid, player, { x: 23, y: 20 }, { precise: true })).toEqual([]);
  });
});

describe('selectMiningTargets (auto): breadth first', () => {
  /** Mines the head of the queue over and over, as holding the button does, and lists the order. */
  const mineSequence = (grid: TargetableTile[][], from: { x: number; y: number }, cursor: { x: number; y: number }, blocks: number) => {
    const order: string[] = [];
    for (let i = 0; i < blocks; i++) {
      const head = selectMiningTargets(grid, from, cursor)[0];
      if (!head) break;
      order.push(`${head.x},${head.y}`);
      grid[head.y][head.x] = { type: MiningTileType.EMPTY, revealed: true };
    }
    return order;
  };

  it('with a far cursor in a thick wall, clears each face before boring deeper, not a one-block tunnel', () => {
    const grid = room(60, (x, y) => x >= 22 && x <= 40 && y >= 10 && y <= 30);
    const order = mineSequence(grid, player, { x: 55, y: 20 }, 9);
    const columns = order.map((k) => Number(k.split(',')[0]));
    // Every block of the first face, then the next face: the columns never go back and never jump two ahead
    expect(columns.slice(0, 3)).toEqual([22, 22, 22]);
    for (let i = 1; i < columns.length; i++) {
      expect(columns[i]).toBeGreaterThanOrEqual(columns[i - 1]);
      expect(columns[i] - columns[0]).toBeLessThanOrEqual(Math.ceil(i / 3));
    }
  });

  it('a tunnel already dug is widened from its mouth before it is dug further', () => {
    const grid = room(60, (x, y) => x >= 22 && x <= 40 && y >= 10 && y <= 30 && !(y === 20 && x <= 25));
    const first = selectMiningTargets(grid, player, { x: 55, y: 20 }).map((c) => `${c.x},${c.y}`);
    expect(first.slice(0, 2).sort()).toEqual(['22,19', '22,21']);
    expect(first).not.toContain('26,20');
  });

  it('still starts with the block under the cursor when it is in the nearest layer', () => {
    const grid = room(40, (x) => x >= 22 && x <= 24);
    expect(keys(selectMiningTargets(grid, player, { x: 22, y: 19 }))[0]).toBe('22,19');
  });
});

describe('mining reach is a circle', () => {
  it('a block on the diagonal is no further than one straight ahead', () => {
    const edge = REACH - 0.01;
    expect(isWithinMiningReach(edge, 0)).toBe(true);
    expect(isWithinMiningReach(edge, edge)).toBe(false);
    expect(isWithinMiningReach(0, -edge)).toBe(true);
    expect(isWithinMiningReach(REACH * 0.7, REACH * 0.7)).toBe(true);
    expect(isWithinMiningReach(REACH * 0.75, REACH * 0.75)).toBe(false);
  });

  it('picks nothing on a diagonal that is out of reach even when each axis is within it', () => {
    const grid = room(60, (x, y) => x - 20 >= 5 && y - 20 >= 5);
    // The block at (+5, +5) is 5.5 away on each axis (within the square) but about 7.8 along the diagonal
    expect(selectMiningTargets(grid, player, { x: 40, y: 40 })).toEqual([]);
  });
});
