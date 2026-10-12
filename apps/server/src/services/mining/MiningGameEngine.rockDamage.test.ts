import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MiningGameEngine } from './MiningGameEngine';
import { MiningTileType, type MiningMapConfigData } from '@mine-me/shared';
import { MiningRockEntity } from './physics/MiningRockEntity';

describe('falling rock damage', () => {
  const cid = 'rock-char';
  let socket: { connected: boolean; emit: ReturnType<typeof vi.fn> };
  let engine: MiningGameEngine;

  const me = () => engine.players.get(cid)!;
  const tick = (n = 1) => { for (let i = 0; i < n; i++) (engine as any).tick(1 / 30); };
  const hurt = () => socket.emit.mock.calls.filter((c: any[]) => c[0] === 'player_damaged').map((c: any[]) => c[1]);

  /** Open shaft x 20..24 (walls at 19 and 25), y 3..39, solid floor at 40; the player stands at (22.5, floor). */
  const shaft = () => {
    for (let x = 19; x <= 25; x++) {
      for (let y = 3; y <= 40; y++) {
        const solid = y === 40 || x === 19 || x === 25;
        engine.grid[y][x] = { type: solid ? MiningTileType.DIRT : MiningTileType.EMPTY, revealed: true };
        if (solid) engine.rigidWorld.addTileCollider(x, y);
        else engine.rigidWorld.removeTileCollider(x, y);
      }
    }
    const body = me().playerBody;
    body.position = { x: 22.5, y: 40 - body.halfHeight };
    body.isGrounded = true;
  };
  /** Drops a rock from `fromY` straight down the player's column and runs until it lands or hits. */
  const dropRock = (fromY: number, ticks = 120) => {
    const rock = new MiningRockEntity(`rock_test_${fromY}`, 22, fromY, engine.rigidWorld, {
      gravityScale: engine.rigidWorld.config.rockGravityScale,
      restitution: engine.rigidWorld.config.rockRestitution,
    });
    (engine as any).rockSubsystem.activeRocks.push(rock);
    for (let i = 0; i < ticks && !rock.hasSettled; i++) {
      // keep the player under the rock regardless of the physics step
      me().playerBody.position = { x: 22.5, y: 40 - me().playerBody.halfHeight };
      tick();
    }
    return rock;
  };

  const start = (mapConfig: Partial<MiningMapConfigData> = {}) => {
    socket = { connected: true, emit: vi.fn() };
    engine = new MiningGameEngine({
      characterId: cid, cityId: 'c', seed: 7, socket: socket as any, maxHealth: 100,
      mapConfig: { mobSpawnCount: 0, ...mapConfig },
    });
    for (const id of [...engine.activeMobs.keys()]) engine.activeMobs.delete(id);
    shaft();
  };

  beforeEach(() => start());

  it('a rock that fell a long way hurts, as its own damage event', () => {
    dropRock(10);
    expect(me().health).toBeLessThan(100);
    const events = hurt();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ sourceName: 'Falling rock' });
    expect(events[0].damage).toBeGreaterThan(0);
  });

  it('a rock hurts a player at most once per fall', () => {
    dropRock(10, 200);
    expect(hurt()).toHaveLength(1);
  });

  it('a taller drop hurts more than a short one', () => {
    start({ rockDamageMax: 0 });
    dropRock(33); // ~6 tiles
    const near = 100 - me().health;
    start({ rockDamageMax: 0 });
    dropRock(12); // ~27 tiles
    const far = 100 - me().health;
    expect(near).toBeGreaterThan(0);
    expect(far).toBeGreaterThan(near);
  });

  it('a very fast rock is judged by its real speed, even though it moves over a tile per tick', () => {
    start({ rockDamageMax: 0 });
    dropRock(10); // ~30 tiles: ~38 tiles/s, far above the 100 health at 5 per tile/s
    expect(me().health).toBe(0);
    expect(hurt()[0].damage).toBeGreaterThan(100);
  });

  it('respects the configured cap', () => {
    start({ rockDamageMax: 7 });
    dropRock(10);
    expect(me().health).toBe(93);
  });

  it('respects the configured minimum speed (no damage below it)', () => {
    start({ rockDamageMinSpeed: 90 });
    dropRock(10);
    expect(me().health).toBe(100);
    expect(hurt()).toHaveLength(0);
  });

  it('applies during the post-hit invulnerability window and does not start a new one', () => {
    me().invulnerableSeconds = 100;
    dropRock(10);
    expect(me().health).toBeLessThan(100);
    expect(me().invulnerableSeconds).toBeGreaterThan(50);
  });

  it('shoves the player sideways instead of upward into the rock', () => {
    dropRock(10);
    const events = hurt();
    expect(events[0].knockback.x).not.toBe(0);
  });

  it('does nothing to a player who is not under the rock', () => {
    me().playerBody.position = { x: 21.5, y: 40 - me().playerBody.halfHeight };
    const rock = new MiningRockEntity('rock_side', 23, 10, engine.rigidWorld, {});
    (engine as any).rockSubsystem.activeRocks.push(rock);
    for (let i = 0; i < 150 && !rock.hasSettled; i++) {
      me().playerBody.position = { x: 21.5, y: 40 - me().playerBody.halfHeight };
      tick();
    }
    expect(me().health).toBe(100);
  });

  it('two players are each hurt once by the same rock', () => {
    const second = { connected: true, emit: vi.fn() };
    engine.addPlayer({ characterId: 'p2', socket: second as any, maxHealth: 100 });
    const p2 = engine.players.get('p2')!;
    const rock = new MiningRockEntity('rock_two', 22, 10, engine.rigidWorld, {});
    (engine as any).rockSubsystem.activeRocks.push(rock);
    for (let i = 0; i < 150 && !rock.hasSettled; i++) {
      for (const p of [me(), p2]) p.playerBody.position = { x: 22.5, y: 40 - p.playerBody.halfHeight };
      tick();
    }
    expect(me().health).toBeLessThan(100);
    expect(p2.health).toBeLessThan(100);
    expect(hurt()).toHaveLength(1);
    expect(second.emit.mock.calls.filter((c: any[]) => c[0] === 'player_damaged')).toHaveLength(1);
  });
});
