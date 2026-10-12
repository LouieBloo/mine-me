import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MiningGameEngine } from './MiningGameEngine';
import { MiningTileType, type MiningMapConfigData } from '@mine-me/shared';
import { hitPlayer } from './testHelpers';

describe('fall damage', () => {
  const cid = 'fall-char';
  let socket: { connected: boolean; emit: ReturnType<typeof vi.fn> };
  let engine: MiningGameEngine;

  const me = () => engine.players.get(cid)!;
  const tick = (n = 1) => { for (let i = 0; i < n; i++) (engine as any).tick(1 / 30); };
  const emitted = (name: string) => socket.emit.mock.calls.filter((c: any[]) => c[0] === name).map((c: any[]) => c[1]);

  /** Open shaft x 20..24, y 5..(floorY-1) with a solid floor at floorY. */
  const shaft = (floorY: number) => {
    for (let x = 19; x <= 25; x++) {
      for (let y = 5; y <= floorY; y++) {
        const solid = y === floorY || x === 19 || x === 25;
        engine.grid[y][x] = { type: solid ? MiningTileType.DIRT : MiningTileType.EMPTY, revealed: true };
        if (solid) engine.rigidWorld.addTileCollider(x, y);
        else engine.rigidWorld.removeTileCollider(x, y);
      }
    }
  };
  const dropFrom = (y: number, floorY: number) => {
    shaft(floorY);
    const body = me().playerBody;
    body.position = { x: 22.5, y };
    body.velocity = { x: 0, y: 0 };
    body.isGrounded = false;
    for (let i = 0; i < 200 && !(body.isGrounded && i > 2); i++) tick();
  };

  const start = (mapConfig: Partial<MiningMapConfigData> = {}) => {
    socket = { connected: true, emit: vi.fn() };
    engine = new MiningGameEngine({
      characterId: cid, cityId: 'c', seed: 7, socket: socket as any, maxHealth: 100,
      mapConfig: { mobSpawnCount: 0, ...mapConfig },
    });
    for (const id of [...engine.activeMobs.keys()]) engine.activeMobs.delete(id);
  };

  beforeEach(() => start());

  it('a long fall hurts, using the default linear rule', () => {
    dropFrom(6, 30);
    // speed at the floor ~ sqrt(2 * 28 * 23.5) capped at terminal 20 -> (20 - 11) * 6 = 54
    expect(me().health).toBe(100 - 54);
    const hurt = emitted('player_damaged');
    expect(hurt).toHaveLength(1);
    expect(hurt[0]).toMatchObject({ damage: 54, sourceName: 'Fall' });
  });

  it('a short drop does nothing (below the minimum speed)', () => {
    dropFrom(12, 14); // ~1.5 tile drop, ~9 tiles/s
    expect(me().health).toBe(100);
    expect(emitted('player_damaged')).toHaveLength(0);
  });

  it('a normal jump does nothing', () => {
    shaft(30);
    const body = me().playerBody;
    body.position = { x: 22.5, y: 30 - body.halfHeight };
    body.isGrounded = true;
    me().inputs = { ...me().inputs, jump: true };
    tick(1);
    me().inputs = { ...me().inputs, jump: false };
    tick(60);
    expect(me().health).toBe(100);
  });

  it('damage grows with the fall height until the cap', () => {
    dropFrom(24, 30); // 6 tiles: ~ 18.3 tiles/s
    const mid = 100 - me().health;
    expect(mid).toBeGreaterThan(0);
    start();
    dropFrom(6, 30);
    const big = 100 - me().health;
    expect(big).toBeGreaterThan(mid);
  });

  it('respects configured minimum, rate and cap', () => {
    start({ fallDamageMinSpeed: 5, fallDamagePerSpeed: 10, fallDamageMax: 30 });
    dropFrom(6, 30);
    expect(me().health).toBe(70);
  });

  it('a fall kills when it exceeds remaining health, and ends the run', () => {
    start({ fallDamageMinSpeed: 0, fallDamagePerSpeed: 100, fallDamageMax: 0 });
    dropFrom(6, 30);
    expect(me().health).toBe(0);
    expect(me().isDead).toBe(true);
  });

  it('applies during the post-hit invulnerability window and does not start one', () => {
    shaft(30);
    const body = me().playerBody;
    body.position = { x: 22.5, y: 6 };
    body.isGrounded = false;
    hitPlayer(engine, cid, 10); // starts the window
    expect(me().invulnerableSeconds).toBeGreaterThan(0);
    me().invulnerableSeconds = 100; // still immune on landing
    for (let i = 0; i < 200 && !body.isGrounded; i++) tick();
    expect(me().health).toBe(100 - 10 - 54);
    expect(me().invulnerableSeconds).toBeGreaterThan(50); // not reset by the fall
  });

  it('does not hurt on a ladder', () => {
    shaft(30);
    for (let y = 6; y < 30; y++) {
      engine.grid[y][22] = { type: MiningTileType.LADDER, revealed: true };
    }
    const body = me().playerBody;
    body.position = { x: 22.5, y: 6 };
    body.isGrounded = false;
    me().inputs = { ...me().inputs, down: true };
    for (let i = 0; i < 400 && !body.isGrounded; i++) tick();
    expect(me().health).toBe(100);
  });

  it('only the falling player is hurt', () => {
    dropFrom(6, 30);
    expect(emitted('player_damaged').every((e: any) => e.sourceName === 'Fall')).toBe(true);
  });
});
