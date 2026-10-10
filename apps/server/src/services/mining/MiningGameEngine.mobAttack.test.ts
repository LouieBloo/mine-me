import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MINING_CONFIG, MiningTileType } from '@mine-me/shared';
import { MiningGameEngine } from './MiningGameEngine';
import { mobEffects } from './testHelpers';

describe('mob attack wind-up and mob collision', () => {
  let engine: MiningGameEngine;
  const cid = 'atk-char';
  const FRAME = 1 / 30;
  const tick = (n = 1) => { for (let i = 0; i < n; i++) (engine as any).tick(FRAME); };
  const me = () => engine.players.get(cid)!;

  beforeEach(() => {
    engine = new MiningGameEngine({
      characterId: cid, cityId: 'c', seed: 6,
      socket: { connected: true, emit: vi.fn() } as any,
      mapConfig: { mobSpawnCount: 0 },
    });
    for (let x = 12; x <= 32; x++) {
      for (let y = 17; y <= 20; y++) engine.grid[y][x] = { type: MiningTileType.EMPTY, revealed: true };
      engine.grid[21][x] = { type: MiningTileType.DIRT, revealed: true };
    }
    me().playerBody.position = { x: 16.5, y: 21 - me().playerBody.halfHeight };
    me().playerBody.isGrounded = true;
  });

  const biter = (gap = 0.9, extra: Record<string, unknown> = {}) =>
    engine.spawnMob(
      { id: 'b', name: 'B', mobEffects: mobEffects({ weaponDamage: 10 }), ...extra },
      { x: 16.5 + gap, y: 21 }
    );

  describe('attack wind-up', () => {
    it('telegraphs first: the attack state shows, the mob stands still, and nothing lands until it ends', () => {
      const mob = biter();
      tick(1);
      expect(mob.attackWindupRemaining).toBeGreaterThan(0);
      expect(mob.animationState).toBe('attack');
      const x = mob.mobBody.position.x;
      tick(5);
      expect(me().health).toBe(me().maxHealth);
      expect(mob.mobBody.position.x).toBe(x);
      expect(mob.animationState).toBe('attack');
      tick(8);
      expect(me().health).toBe(me().maxHealth - 10);
      expect(mob.attackWindupRemaining).toBe(0);
    });

    it('the wind-up length is configurable per mob, and 0 means instant', () => {
      const slow = biter(0.9, { aiConfig: { attackWindupMs: 600 } });
      expect(slow.attackWindupSeconds).toBeCloseTo(0.6);
      expect(biter(0.9).attackWindupSeconds).toBe(MINING_CONFIG.MOB_ATTACK_WINDUP_SECONDS);
      for (const m of Array.from(engine.activeMobs.values())) engine.activeMobs.delete(m.id);

      biter(0.9, { aiConfig: { attackWindupMs: 0 } });
      tick(1);
      expect(me().health).toBe(me().maxHealth - 10);
    });

    it('a target that gets well out of reach during the wind-up dodges the attack', () => {
      const mob = biter();
      tick(2);
      expect(mob.attackWindupRemaining).toBeGreaterThan(0);
      me().playerBody.position = { x: mob.mobBody.position.x - 4, y: me().playerBody.position.y };
      tick(12);
      expect(me().health).toBe(me().maxHealth);
      expect(mob.attackWindupRemaining).toBe(0);
    });

    it('a solid wall raised during the wind-up blocks the hit', () => {
      const mob = biter(1.9, { aiConfig: { attackRange: 3 } });
      tick(2);
      expect(mob.attackWindupRemaining).toBeGreaterThan(0);
      for (let y = 17; y <= 20; y++) engine.grid[y][17] = { type: MiningTileType.ROCK, revealed: true };
      tick(12);
      expect(me().health).toBe(me().maxHealth);
    });

    it('being stunned cancels the attack in progress', () => {
      const mob = biter();
      tick(3);
      expect(mob.attackWindupRemaining).toBeGreaterThan(0);
      mob.hitStunDurationMs = 200;
      tick(1);
      expect(mob.attackWindupRemaining).toBe(0);
      tick(5);
      expect(me().health).toBe(me().maxHealth);
    });

    it('does not slow a fast swinger: the telegraph is shorter than one swing', () => {
      const mob = biter(0.9, { mobEffects: mobEffects({ weaponDamage: 0, miningSpeed: 50 }) }); // 4 swings/s; no damage so the player isn't knocked out of reach
      let swings = 0;
      for (let i = 0; i < 90; i++) { tick(1); if (mob.swungThisTick) swings++; }
      expect(swings).toBe(12);
    });
  });

  describe('mob collision', () => {
    it('mobs spawned on top of each other spread out', () => {
      const a = engine.spawnMob({ id: 'a', name: 'A', aiConfig: { aggroRange: 0 } }, { x: 25.5, y: 21 });
      const b = engine.spawnMob({ id: 'b', name: 'B', aiConfig: { aggroRange: 0 } }, { x: 25.5, y: 21 });
      tick(30);
      const gap = Math.abs(a.mobBody.position.x - b.mobBody.position.x);
      expect(gap).toBeGreaterThanOrEqual(a.mobBody.halfWidth + b.mobBody.halfWidth - 1e-3);
    });

    it('a chasing crowd does not collapse into one spot', () => {
      const mobs = [0, 1, 2].map((i) => engine.spawnMob({ id: `c${i}`, name: 'C', moveSpeed: 3, aiConfig: { aggroRange: 30 } }, { x: 28 + i * 0.01, y: 21 }));
      tick(120);
      const xs = mobs.map((m) => m.mobBody.position.x).sort((p, q) => p - q);
      expect(xs[1] - xs[0]).toBeGreaterThan(0.3);
      expect(xs[2] - xs[1]).toBeGreaterThan(0.3);
    });

    it('a stationary mob (target dummy) is never shoved', () => {
      const dummy = engine.spawnMob({ id: 'd', name: 'D', aiType: 'STATIONARY' }, { x: 25.5, y: 21 });
      engine.spawnMob({ id: 'm', name: 'M', aiConfig: { aggroRange: 0 } }, { x: 25.6, y: 21 });
      tick(30);
      expect(dummy.mobBody.position.x).toBe(25.5);
    });

    it('a mob overlapping the player is pushed out, and the player is not moved', () => {
      const mob = engine.spawnMob({ id: 'o', name: 'O', aiConfig: { aggroRange: 0 } }, { x: 16.6, y: 21 });
      const playerX = me().playerBody.position.x;
      tick(30);
      expect(me().playerBody.position.x).toBe(playerX);
      expect(Math.abs(mob.mobBody.position.x - playerX)).toBeGreaterThanOrEqual(
        mob.mobBody.halfWidth + me().playerBody.halfWidth - 1e-3
      );
    });
  });
});
