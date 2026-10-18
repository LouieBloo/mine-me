import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MINING_QUEUE_LENGTH, MiningTileType } from '@mine-me/shared';
import { MiningGameEngine } from './MiningGameEngine';

describe('pickaxe auto-target', () => {
  const cid = 'auto-char';
  let engine: MiningGameEngine;
  const me = () => engine.players.get(cid)!;
  const tick = (n = 1) => { for (let i = 0; i < n; i++) (engine as any).tick(1 / 30); };
  const typeAt = (x: number, y: number) => engine.grid[y][x].type;
  const hold = (cursor: { x: number; y: number } | null, precise = false) =>
    engine.handleInput(cid, { up: false, down: false, left: false, right: false, miningKey: cursor !== null, miningTarget: cursor, preciseMining: precise, sequence: ++seq });
  let seq = 0;

  /** A room x 10..34, y 8..20 over a floor at row 21, with a wall of dirt left of x = 20 in the rows the player stands in. */
  beforeEach(() => {
    seq = 0;
    engine = new MiningGameEngine({
      characterId: cid, cityId: 'c', seed: 5, mapConfig: { mobSpawnCount: 0 },
      toolDamage: 1000, miningSpeed: 100, socket: { connected: true, emit: vi.fn() } as any,
    });
    for (const id of [...engine.activeMobs.keys()]) engine.activeMobs.delete(id);
    for (let x = 6; x <= 34; x++) {
      for (let y = 8; y <= 20; y++) engine.grid[y][x] = { type: x < 20 && y >= 18 ? MiningTileType.DIRT : MiningTileType.EMPTY, revealed: true };
      engine.grid[21][x] = { type: MiningTileType.DIRT, revealed: true };
    }
    me().playerBody.position = { x: 20.5, y: 21 - me().playerBody.halfHeight };
    me().playerBody.isGrounded = true;
    // The player's centre is about row 19.6: mine along row 19
    for (let x = 6; x < 20; x++) engine.grid[19][x] = { type: MiningTileType.DIRT, revealed: true };
  });

  /** Ticks until `count` cells in row 19 (x < 20) have been mined, noting the order they went in. */
  const mineOrder = (count: number, maxTicks = 3000): string[] => {
    const gone: string[] = [];
    const seen = new Set<string>();
    for (let i = 0; i < maxTicks && gone.length < count; i++) {
      tick();
      for (let x = 6; x < 20; x++) {
        const key = `${x},19`;
        if (typeAt(x, 19) === MiningTileType.EMPTY && !seen.has(key)) {
          seen.add(key);
          gone.push(key);
        }
      }
    }
    return gone;
  };

  it('with the cursor far to the left, mines the blocks along the line one after another, nearest first, with no cursor movement', () => {
    hold({ x: 8, y: 19 });
    expect(mineOrder(5)).toEqual(['19,19', '18,19', '17,19', '16,19', '15,19']);
  });

  it('lines up the face in front of the player: the middle block first, then the blocks above and below it, and nothing behind', () => {
    hold({ x: 8, y: 19 });
    const queue = engine.blockSubsystem.miningQueue(me());
    expect(queue).toHaveLength(MINING_QUEUE_LENGTH);
    expect(queue[0]).toEqual({ x: 19, y: 19 });
    expect(queue.map((c) => c.x)).toEqual([19, 19, 19]);
    expect(queue.map((c) => c.y).sort()).toEqual([18, 19, 20]);
  });

  it('mines one block per swing, not the whole queue at once', () => {
    hold({ x: 8, y: 19 });
    let broken = 0;
    for (let i = 0; i < 400 && broken === 0; i++) {
      tick();
      broken = [...Array(14).keys()].filter((i) => typeAt(6 + i, 19) === MiningTileType.EMPTY).length;
    }
    expect(broken).toBe(1);
  });

  it('with Ctrl held, mines only the block under the cursor', () => {
    hold({ x: 17, y: 19 }, true);
    expect(engine.blockSubsystem.miningQueue(me())).toEqual([{ x: 17, y: 19 }]);
    tick(60);
    expect(typeAt(17, 19)).toBe(MiningTileType.EMPTY);
    expect(typeAt(19, 19)).toBe(MiningTileType.DIRT);
    expect(typeAt(18, 19)).toBe(MiningTileType.DIRT);
  });

  it('with Ctrl on a block out of reach or on air, mines nothing', () => {
    hold({ x: 6, y: 19 }, true);
    tick(60);
    expect(me().isMining).toBe(false);
    hold({ x: 25, y: 12 }, true);
    tick(60);
    expect(me().isMining).toBe(false);
  });

  it('with the cursor on air above the wall and nothing along the line, mines nothing', () => {
    hold({ x: 30, y: 10 });
    tick(60);
    expect(me().isMining).toBe(false);
  });

  it('switches to the next queue when the cursor moves, without a new click', () => {
    for (let x = 6; x < 20; x++) engine.grid[18][x] = { type: MiningTileType.DIRT, revealed: true };
    hold({ x: 8, y: 19 });
    expect(engine.blockSubsystem.miningQueue(me())[0]).toEqual({ x: 19, y: 19 });
    hold({ x: 30, y: 8 }); // up and to the right, away from the wall on the left
    expect(engine.blockSubsystem.miningQueue(me())).toEqual([]);
  });

  it('cannot be tricked into mining behind a block that cannot be mined', () => {
    for (const y of [18, 19, 20]) engine.grid[y][19] = { type: MiningTileType.ROCK, revealed: true };
    hold({ x: 8, y: 19 });
    expect(engine.blockSubsystem.miningQueue(me())).toEqual([]);
  });

  it('keeps mining the block it started on while it is still lined up', () => {
    hold({ x: 8, y: 19 });
    me().isMining = true;
    me().miningTarget = { x: 19, y: 20 };
    expect(engine.blockSubsystem.miningQueue(me())[0]).toEqual({ x: 19, y: 20 });
  });

  it('does nothing when the mine button is up', () => {
    hold(null);
    expect(engine.blockSubsystem.miningQueue(me())).toEqual([]);
  });
});
