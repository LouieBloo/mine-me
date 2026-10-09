import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MINING_CONFIG, MiningTileType } from '@mine-me/shared';
import { MiningGameEngine } from './MiningGameEngine';

describe('mobs take their numbers from their data', () => {
  let engine: MiningGameEngine;
  const cid = 'cfg-char';

  const make = (mapConfig: Record<string, unknown> = {}) => {
    engine = new MiningGameEngine({
      characterId: cid, cityId: 'c', seed: 6,
      socket: { connected: true, emit: vi.fn() } as any,
      mapConfig: { mobSpawnCount: 0, ...mapConfig },
    });
    return engine;
  };

  /** An open room where the mob and the player are `gap` tiles apart on a dirt floor. */
  const room = (gap: number) => {
    for (let x = 14; x <= 30; x++) {
      for (let y = 17; y <= 20; y++) engine.grid[y][x] = { type: MiningTileType.EMPTY, revealed: true };
      engine.grid[21][x] = { type: MiningTileType.DIRT, revealed: true };
    }
    const p = engine.players.get(cid)!;
    p.playerBody.position = { x: 16.5, y: 21 - p.playerBody.halfHeight };
    p.playerBody.isGrounded = true;
    return { p, mobX: 16.5 + gap };
  };
  const tick = (n: number) => { for (let i = 0; i < n; i++) (engine as any).tick(1 / 30); };

  beforeEach(() => make());

  describe('AI settings', () => {
    it('reads aggro range, attack range, attack cooldown, mine range and canMine from aiConfig', () => {
      const mob = engine.spawnMob(
        { id: 'm', name: 'M', aiConfig: { aggroRange: 7, attackRange: 2.5, attackCooldownMs: 400, mineRange: 3, canMine: false } },
        { x: 20, y: 21 }
      );
      expect(mob).toMatchObject({ aggroRange: 7, attackRange: 2.5, attackCooldownMs: 400, mineRange: 3, canMine: false });
    });

    it('uses the shared defaults for whatever the data leaves out', () => {
      const mob = engine.spawnMob({ id: 'bare', name: 'Bare' }, { x: 20, y: 21 });
      expect(mob).toMatchObject({
        aggroRange: MINING_CONFIG.MOB_DEFAULT_AGGRO_RANGE,
        attackRange: MINING_CONFIG.MOB_DEFAULT_ATTACK_RANGE,
        attackCooldownMs: MINING_CONFIG.MOB_DEFAULT_ATTACK_COOLDOWN_MS,
        mineRange: MINING_CONFIG.MOB_DEFAULT_MINE_RANGE,
        canMine: true,
        miningSpeed: MINING_CONFIG.MOB_DEFAULT_MINING_SPEED,
      });
    });

    it.each([[-1], [NaN], ['far' as any]])('ignores an invalid aiConfig value (%s)', (bad) => {
      const mob = engine.spawnMob({ id: 'x', name: 'X', aiConfig: { aggroRange: bad, attackRange: bad, attackCooldownMs: bad } }, { x: 20, y: 21 });
      expect(mob.aggroRange).toBe(MINING_CONFIG.MOB_DEFAULT_AGGRO_RANGE);
      expect(mob.attackRange).toBe(MINING_CONFIG.MOB_DEFAULT_ATTACK_RANGE);
      expect(mob.attackCooldownMs).toBe(MINING_CONFIG.MOB_DEFAULT_ATTACK_COOLDOWN_MS);
    });

    it('a mob does not notice a player beyond its own aggro range', () => {
      const { p, mobX } = room(10);
      const mob = engine.spawnMob({ id: 'shy', name: 'Shy', attack: 5, aiConfig: { aggroRange: 4 } }, { x: mobX, y: 21 });
      const startX = mob.mobBody.position.x;
      tick(30);
      expect(mob.mobBody.position.x).toBeCloseTo(startX, 1); // never moved: nobody in range
      expect(p.health).toBe(p.maxHealth);
    });

    it('a mob does notice a player inside its aggro range', () => {
      const { mobX } = room(10);
      const mob = engine.spawnMob({ id: 'keen', name: 'Keen', moveSpeed: 3, aiConfig: { aggroRange: 15 } }, { x: mobX, y: 21 });
      const startX = mob.mobBody.position.x;
      tick(30);
      expect(mob.mobBody.position.x).toBeLessThan(startX - 1); // came toward the player
    });

    it('the mob\'s own attack cooldown spaces its hits', () => {
      const { p, mobX } = room(0.9);
      // Immune window shorter than the cooldown so the cooldown is what limits hits
      const mob = engine.spawnMob({ id: 'fast', name: 'Fast', attack: 3, aiType: 'CHASE_AND_MINE', aiConfig: { attackCooldownMs: 300 } }, { x: mobX, y: 21 });
      mob.mobBody.velocity.x = 0;
      p.maxHealth = 1000;
      p.health = 1000;
      tick(30 * 3);
      const hits = (1000 - p.health) / 3;
      expect(hits).toBeGreaterThanOrEqual(5); // ~3 s / 0.5 s invulnerability window, or the 0.3 s cooldown
    });
  });

  describe('moving mobs obey their own speed', () => {
    it('a slow mob is slower than a fast one over the same time', () => {
      const { mobX } = room(12);
      const slow = engine.spawnMob({ id: 's', name: 'S', moveSpeed: 1, aiConfig: { aggroRange: 30 } }, { x: mobX, y: 21 });
      const fast = engine.spawnMob({ id: 'f', name: 'F', moveSpeed: 4, aiConfig: { aggroRange: 30 } }, { x: mobX + 1, y: 21 });
      const slowStart = slow.mobBody.position.x;
      const fastStart = fast.mobBody.position.x;
      tick(30);
      const slowMoved = slowStart - slow.mobBody.position.x;
      const fastMoved = fastStart - fast.mobBody.position.x;
      expect(fastMoved).toBeGreaterThan(slowMoved * 2);
    });
  });

  describe('the mob roster and the surface dummy come from the map config only', () => {
    it('spawns nothing when the config names no mobs', () => {
      make({ mobSpawnCount: 5, allowedMobIds: [] });
      expect(engine.getActiveMobs()).toEqual([]);
      make({ mobSpawnCount: 5 }); // no allowedMobIds at all
      expect(engine.getActiveMobs()).toEqual([]);
    });

    it('spawns the configured mobs, cycling through the list', () => {
      make({ mobSpawnCount: 4, allowedMobIds: ['Mole Person', 'Mario'] });
      expect(engine.getActiveMobs().map((m) => m.name)).toEqual(['Mole Person', 'Mario', 'Mole Person', 'Mario']);
    });

    it('skips configured ids that do not exist', () => {
      make({ mobSpawnCount: 2, allowedMobIds: ['no-such-mob'] });
      expect(engine.getActiveMobs()).toEqual([]);
    });

    it('populateCavernMobs can still be told which mobs to use explicitly', () => {
      make();
      engine.populateCavernMobs({ count: 2, mobIds: ['Mario'] });
      expect(engine.getActiveMobs().map((m) => m.name)).toEqual(['Mario', 'Mario']);
    });
  });
});
