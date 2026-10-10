import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MINING_CONFIG, MiningTileType } from '@mine-me/shared';
import { MiningGameEngine } from './MiningGameEngine';
import { mobEffects } from './testHelpers';

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
    it('reads aggro range, attack range, mine range and canMine from aiConfig', () => {
      const mob = engine.spawnMob(
        { id: 'm', name: 'M', aiConfig: { aggroRange: 7, attackRange: 2.5, mineRange: 3, canMine: false } },
        { x: 20, y: 21 }
      );
      expect(mob).toMatchObject({ aggroRange: 7, attackRange: 2.5, mineRange: 3, canMine: false });
    });

    it('uses the shared defaults for whatever the data leaves out', () => {
      const mob = engine.spawnMob({ id: 'bare', name: 'Bare' }, { x: 20, y: 21 });
      expect(mob).toMatchObject({
        aggroRange: MINING_CONFIG.MOB_DEFAULT_AGGRO_RANGE,
        attackRange: MINING_CONFIG.MOB_DEFAULT_ATTACK_RANGE,
        mineRange: MINING_CONFIG.MOB_DEFAULT_MINE_RANGE,
        canMine: true,
      });
    });

    it.each([[-1], [NaN], ['far' as any]])('ignores an invalid aiConfig value (%s)', (bad) => {
      const mob = engine.spawnMob({ id: 'x', name: 'X', aiConfig: { aggroRange: bad, attackRange: bad } }, { x: 20, y: 21 });
      expect(mob.aggroRange).toBe(MINING_CONFIG.MOB_DEFAULT_AGGRO_RANGE);
      expect(mob.attackRange).toBe(MINING_CONFIG.MOB_DEFAULT_ATTACK_RANGE);
    });

    it('a mob does not notice a player beyond its own aggro range', () => {
      const { p, mobX } = room(10);
      const mob = engine.spawnMob({ id: 'shy', name: 'Shy', mobEffects: mobEffects({ weaponDamage: 5 }), aiConfig: { aggroRange: 4 } }, { x: mobX, y: 21 });
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

    it('the mob\'s Mining Speed sets how often it swings at a player in reach (same rate as players)', () => {
      const swingsOver3s = (miningSpeed: number) => {
        make();
        const { mobX } = room(0.9);
        const mob = engine.spawnMob(
          { id: 'fast', name: 'Fast', aiType: 'CHASE_AND_MINE', mobEffects: mobEffects({ miningSpeed }) }, // no Damage: the player isn't knocked out of reach
          { x: mobX, y: 21 }
        );
        let swings = 0;
        for (let i = 0; i < 90; i++) {
          (engine as any).tick(1 / 30);
          if (mob.swungThisTick) swings++;
        }
        return swings;
      };
      expect(swingsOver3s(12.5)).toBe(3); // 1 swing/s
      expect(swingsOver3s(25)).toBe(6); // 2 swings/s, the baseline
      expect(swingsOver3s(50)).toBe(12); // 4 swings/s
    });

    it('a mob with no Damage effect swings but deals no damage', () => {
      const { p, mobX } = room(0.9);
      engine.spawnMob({ id: 'harmless', name: 'H', mobEffects: mobEffects({ miningSpeed: 25 }) }, { x: mobX, y: 21 });
      tick(60);
      expect(p.health).toBe(p.maxHealth);
    });

    it('the Damage effect is the hit size and Knockback pushes the player away', () => {
      const { p, mobX } = room(0.9);
      engine.spawnMob(
        { id: 'biter', name: 'B', mobEffects: mobEffects({ weaponDamage: 9, knockback: 80 }) },
        { x: mobX, y: 21 }
      );
      tick(12);
      expect(p.health).toBe(p.maxHealth - 9);
      expect(p.playerBody.velocity.x).toBeLessThan(0); // mob is to the right: pushed left
    });
  });

  describe('combat stats come from effects, like gear', () => {
    it('derives every stat from the attached effects', () => {
      const mob = engine.spawnMob(
        {
          id: 'e', name: 'E',
          mobEffects: mobEffects({ miningSpeed: 50, toolDamage: 30, weaponDamage: 8, pickPower: 2, knockback: 60 }),
        },
        { x: 20, y: 21 }
      );
      expect(mob.stats).toEqual({ miningSpeed: 50, toolDamage: 30, weaponDamage: 8, pickPower: 2, knockback: 60 });
    });

    it('a mob with no effects has no combat stats (it cannot hurt or dig, like unarmed players)', () => {
      const mob = engine.spawnMob({ id: 'bare', name: 'Bare' }, { x: 20, y: 21 });
      expect(mob.stats).toEqual({ miningSpeed: 0, toolDamage: 0, weaponDamage: 0, pickPower: 0, knockback: 0 });
    });
  });
  describe('moving mobs obey their own speed', () => {
    it('a slow mob is slower than a fast one over the same time', () => {
      // One mob per run: two mobs chasing the same player would (rightly) bump into each other
      const distanceMoved = (moveSpeed: number) => {
        make();
        const { mobX } = room(12);
        const mob = engine.spawnMob({ id: 'm', name: 'M', moveSpeed, aiConfig: { aggroRange: 30 } }, { x: mobX, y: 21 });
        const start = mob.mobBody.position.x;
        tick(30);
        return start - mob.mobBody.position.x;
      };
      expect(distanceMoved(4)).toBeGreaterThan(distanceMoved(1) * 2);
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
