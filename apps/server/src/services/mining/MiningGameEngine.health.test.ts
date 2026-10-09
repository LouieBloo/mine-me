import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MiningGameEngine } from './MiningGameEngine';
import { MINING_CONFIG, MiningTileType } from '@mine-me/shared';
import { hitMob, hitPlayer } from './testHelpers';

describe('player health, damage, knockback and death', () => {
  const cid = 'hp-char';
  let socket: { connected: boolean; emit: ReturnType<typeof vi.fn> };
  let onHealth: any;
  let onDeath: any;
  let engine: MiningGameEngine;

  const emitted = (name: string) => socket.emit.mock.calls.filter((c: any[]) => c[0] === name).map((c: any[]) => c[1]);
  const me = () => engine.players.get(cid)!;
  const tick = (n = 1) => { for (let i = 0; i < n; i++) (engine as any).tick(1 / 30); };

  beforeEach(() => {
    socket = { connected: true, emit: vi.fn() };
    onHealth = vi.fn();
    onDeath = vi.fn();
    engine = new MiningGameEngine({
      characterId: cid,
      cityId: 'c',
      seed: 7,
      socket: socket as any,
      maxHealth: 100,
      onPlayerHealthChanged: onHealth,
      onPlayerDeath: onDeath,
      mapConfig: { mobSpawnCount: 0 },
    });
    for (const id of [...engine.activeMobs.keys()]) engine.activeMobs.delete(id);
  });

  describe('health & damage rules', () => {
    it('starts at full health, defaulting to 100 when no max is given', () => {
      expect(me().health).toBe(100);
      expect(me().maxHealth).toBe(100);
      const e2 = new MiningGameEngine({ characterId: 'x', cityId: 'c', seed: 1, socket: socket as any });
      expect(e2.players.get('x')!.maxHealth).toBe(MINING_CONFIG.DEFAULT_PLAYER_MAX_HEALTH);
      const e3 = new MiningGameEngine({ characterId: 'y', cityId: 'c', seed: 1, socket: socket as any, maxHealth: 250 });
      expect(e3.players.get('y')!.health).toBe(250);
      const e4 = new MiningGameEngine({ characterId: 'z', cityId: 'c', seed: 1, socket: socket as any, maxHealth: NaN });
      expect(e4.players.get('z')!.maxHealth).toBe(100);
    });

    it('re-adding an existing player (reconnect) keeps their current health', () => {
      hitPlayer(engine, cid, 30);
      engine.addPlayer({ characterId: cid, socket: socket as any, maxHealth: 100 });
      expect(me().health).toBe(70);
    });

    it('reduces health, notifies the client and the app, and returns true', () => {
      expect(hitPlayer(engine, cid, 30, { id: 'm1', name: 'Mole' })).toBe(true);
      expect(me().health).toBe(70);
      expect(emitted('player_damaged')[0]).toMatchObject({ damage: 30, health: 70, maxHealth: 100, sourceId: 'm1', sourceName: 'Mole' });
      expect(onHealth).toHaveBeenCalledWith(cid, 70, 100);
    });

    it.each([0, -5, NaN, Infinity])('ignores invalid damage amount %s', (amount) => {
      expect(hitPlayer(engine, cid, amount)).toBe(false);
      expect(me().health).toBe(100);
      expect(emitted('player_damaged')).toHaveLength(0);
    });

    it('ignores damage to unknown players', () => {
      expect(hitPlayer(engine, 'ghost', 10)).toBe(false);
    });
  });

  describe('invulnerability window', () => {
    it('ignores hits during the grace window and accepts them afterwards', () => {
      expect(hitPlayer(engine, cid, 10)).toBe(true);
      expect(hitPlayer(engine, cid, 10)).toBe(false);
      expect(me().health).toBe(90);

      tick(Math.ceil(MINING_CONFIG.PLAYER_HIT_INVULNERABILITY * 30) + 1);
      expect(me().invulnerableSeconds).toBe(0);
      expect(hitPlayer(engine, cid, 10)).toBe(true);
      expect(me().health).toBe(80);
    });
  });

  describe('knockback', () => {
    it('pushes the player away from a source to their left', () => {
      const p = me().playerBody.position;
      hitPlayer(engine, cid, 5, { position: { x: p.x - 1, y: p.y } });
      expect(emitted('player_damaged')[0].knockback).toEqual({
        x: MINING_CONFIG.PLAYER_HIT_KNOCKBACK_X,
        y: MINING_CONFIG.PLAYER_HIT_KNOCKBACK_Y,
      });
      expect(me().playerBody.velocity.x).toBe(MINING_CONFIG.PLAYER_HIT_KNOCKBACK_X);
      expect(me().playerBody.knockbackRemaining).toBeGreaterThan(0);
    });

    it('pushes the player away from a source to their right', () => {
      const p = me().playerBody.position;
      hitPlayer(engine, cid, 5, { position: { x: p.x + 1, y: p.y } });
      expect(emitted('player_damaged')[0].knockback.x).toBe(-MINING_CONFIG.PLAYER_HIT_KNOCKBACK_X);
    });

    it('applies no knockback when the source has no position', () => {
      hitPlayer(engine, cid, 5);
      expect(emitted('player_damaged')[0]).toMatchObject({ knockback: { x: 0, y: 0 }, knockbackSeconds: 0 });
      expect(me().playerBody.knockbackRemaining).toBe(0);
    });
  });

  describe('death', () => {
    it('does not end the run until the tick finishes, then notifies the client once and the manager once', () => {
      hitPlayer(engine, cid, 999, { id: 'm1', name: 'Mole' });
      expect(me().health).toBe(0);
      expect(me().isDead).toBe(true);
      expect(onDeath).not.toHaveBeenCalled();

      tick();
      expect(emitted('mining_session_ended')).toEqual([
        expect.objectContaining({ reason: 'death', message: expect.stringContaining('backpack') }),
      ]);
      expect(onDeath).toHaveBeenCalledTimes(1);
      expect(onDeath).toHaveBeenCalledWith(cid);

      tick(); // nothing is processed twice
      expect(onDeath).toHaveBeenCalledTimes(1);
    });

    it('applies no knockback on the killing blow and ignores further damage', () => {
      const p = me().playerBody.position;
      hitPlayer(engine, cid, 999, { position: { x: p.x - 1, y: p.y } });
      expect(emitted('player_damaged')[0].knockback).toEqual({ x: 0, y: 0 });
      expect(hitPlayer(engine, cid, 5)).toBe(false);
    });

    it('a player who left before the end of the tick is not reported dead', () => {
      hitPlayer(engine, cid, 999);
      engine.removePlayer(cid);
      tick();
      expect(onDeath).not.toHaveBeenCalled();
    });
  });

  describe('mob attacks', () => {
    // A flat, fully open arena around the player so nothing blocks mobs or line of sight
    const arena = () => {
      // Move the player to a deep, cleared room standing on a dirt floor (feet on the top of row cy + 1)
      const cx = 22;
      const cy = 20;
      me().playerBody.position = { x: cx + 0.5, y: cy + 1 - me().playerBody.halfHeight };
      me().playerBody.isGrounded = true;
      const p = me().playerBody.position;
      for (let y = cy - 3; y <= cy + 3; y++) {
        for (let x = cx - 6; x <= cx + 6; x++) {
          engine.grid[y][x] = { type: y > cy ? MiningTileType.DIRT : MiningTileType.EMPTY, revealed: true };
        }
      }
      return { cx, cy, p };
    };
    const spawnAdjacentMob = (attack = 12) => {
      const { p } = arena();
      const mob = engine.spawnMob({ id: 'biter', name: 'Biter', attack, health: 50 }, { x: p.x + 0.8, y: 21 });
      return mob;
    };

    it('damages a player in range by the mob attack stat and knocks them away', () => {
      const mob = spawnAdjacentMob(12);
      tick(2);
      expect(me().health).toBe(88);
      const hit = emitted('player_damaged')[0];
      expect(hit).toMatchObject({ damage: 12, sourceId: mob.id, sourceName: 'Biter' });
      expect(hit.knockback.x).toBeLessThan(0); // mob is to the right, so push left
      expect(onHealth).toHaveBeenCalledWith(cid, 88, 100);
    });

    it('does not hit again within the mob attack cooldown / invulnerability window', () => {
      spawnAdjacentMob(12);
      tick(10);
      expect(me().health).toBe(88);
    });

    it('hits again once the cooldown has passed', () => {
      spawnAdjacentMob(12);
      tick(60); // ~2s: past the 1.2s attack cooldown
      expect(me().health).toBeLessThan(88);
    });

    describe('line of sight', () => {
      // Force the AI to declare an attack so only the engine's own checks decide whether it lands
      const forceAttack = (mob: any) =>
        vi.spyOn(mob.ai, 'update').mockReturnValue({
          moveX: 0, jump: false, climbUp: false, climbDown: false,
          isMining: false, miningTarget: null,
          isAttacking: true, attackTargetId: cid, animationState: 'attack',
        } as any);

      it('lands when nothing is in between (control)', () => {
        const { p } = arena();
        const mob = engine.spawnMob({ id: 'biter', name: 'Biter', attack: 12 }, { x: p.x + 2, y: 21 });
        forceAttack(mob);
        tick();
        expect(me().health).toBe(88);
      });

      it('is blocked by solid tiles between the mob and the player', () => {
        const { cx, cy, p } = arena();
        const mob = engine.spawnMob({ id: 'biter', name: 'Biter', attack: 12 }, { x: cx + 4.5, y: 21 });
        for (let y = cy - 2; y <= cy; y++) engine.grid[y][cx + 2] = { type: MiningTileType.ROCK, revealed: true };
        forceAttack(mob);
        tick(3);
        expect(me().health).toBe(100);
        expect(emitted('player_damaged')).toHaveLength(0);
        expect(p.x).toBeLessThan(mob.mobBody.position.x);
      });
    });

    it('does not attack a dead player and stops targeting them', () => {
      spawnAdjacentMob(12);
      hitPlayer(engine, cid, 999);
      const before = emitted('player_damaged').length;
      tick(40);
      expect(emitted('player_damaged').length).toBe(before);
    });

    it('a mob hit that kills ends the run', () => {
      spawnAdjacentMob(500);
      tick(3);
      expect(onDeath).toHaveBeenCalledWith(cid);
    });
  });
});
