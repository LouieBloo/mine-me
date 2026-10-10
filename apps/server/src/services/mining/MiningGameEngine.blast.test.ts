import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MINING_CONFIG, MiningTileType, blastDamageAt } from '@mine-me/shared';
import { MiningGameEngine } from './MiningGameEngine';
import { partialDefinitions } from './testHelpers';

describe('dynamite blast rules', () => {
  let engine: MiningGameEngine;
  const cid = 'blast-char';
  const me = () => engine.players.get(cid)!;
  const CX = 20;
  const CY = 25;

  const boom = (radius = 4, itemId?: string) =>
    engine.explodeDynamite({ id: 'dyn', position: { x: CX, y: CY }, explosionRadius: radius, ownerId: cid, itemId } as any);

  /** A solid block of dirt around the blast centre with an open pocket for entities. */
  beforeEach(() => {
    engine = new MiningGameEngine({
      characterId: cid, cityId: 'c', seed: 6,
      socket: { connected: true, emit: vi.fn() } as any,
      mapConfig: { mobSpawnCount: 0 },
    });
    for (let y = CY - 8; y <= CY + 8; y++) {
      for (let x = CX - 10; x <= CX + 10; x++) engine.grid[y][x] = { type: MiningTileType.DIRT, revealed: true };
    }
    // The player stands far from the blast unless a test moves them
    me().playerBody.position = { x: 5.5, y: 5.5 };
  });

  const placeMob = (dx: number, dy = 0) => {
    const mob = engine.spawnMob({ id: `m${dx}`, name: 'M', health: 1000 }, { x: CX + dx, y: CY + dy });
    mob.mobBody.position = { x: CX + dx, y: CY + dy };
    return mob;
  };

  describe('tiles', () => {
    it('clears diggable blocks in the radius and leaves everything outside it', () => {
      boom(3);
      expect(engine.grid[CY][CX].type).toBe(MiningTileType.EMPTY);
      expect(engine.grid[CY][CX + 3].type).toBe(MiningTileType.EMPTY);
      expect(engine.grid[CY][CX + 6].type).toBe(MiningTileType.DIRT);
    });

    it('spares the entrance, and destroys rocks, ladders and torches', () => {
      engine.grid[CY][CX + 2] = { type: MiningTileType.ENTRANCE, revealed: true };
      engine.grid[CY][CX + 1] = { type: MiningTileType.ROCK, revealed: true };
      engine.grid[CY + 1][CX] = { type: MiningTileType.LADDER, revealed: true };
      engine.grid[CY - 1][CX] = { type: MiningTileType.TORCH, revealed: true };
      boom(3);
      expect(engine.grid[CY][CX + 2].type).toBe(MiningTileType.ENTRANCE);
      expect(engine.grid[CY][CX + 1].type).toBe(MiningTileType.EMPTY);
      expect(engine.grid[CY + 1][CX].type).toBe(MiningTileType.EMPTY);
      expect(engine.grid[CY - 1][CX].type).toBe(MiningTileType.EMPTY);
    });

    it('sets rocks above the cleared area falling, and nothing is left floating', () => {
      // Stack of rocks in column CX+2: those inside the radius are destroyed, those above fall
      const x = CX + 2;
      for (let y = CY - 6; y <= CY + 1; y++) engine.grid[y][x] = { type: MiningTileType.ROCK, revealed: true };
      boom(3);
      expect(engine.activeRocks.length).toBeGreaterThan(0);
      for (let y = CY - 6; y <= CY + 3; y++) {
        // any rock tile still standing must have solid ground below it
        if (engine.grid[y][x].type === MiningTileType.ROCK) {
          expect(engine.grid[y + 1][x].type).not.toBe(MiningTileType.EMPTY);
        }
      }
    });

    it('a rock beside the blast whose support was dug out starts to fall', () => {
      const x = CX + 1;
      engine.grid[CY - 2][x] = { type: MiningTileType.ROCK, revealed: true };
      boom(2); // clears (CX+1, CY-1) beneath it
      expect(engine.grid[CY - 2][x].type).toBe(MiningTileType.EMPTY);
      expect(engine.activeRocks.length).toBeGreaterThan(0);
    });

    it('resets leftover damage on cleared tiles', () => {
      engine.grid[CY][CX + 1] = { type: MiningTileType.DIRT, revealed: true, damage: 60 };
      boom(3);
      expect(engine.grid[CY][CX + 1].damage).toBe(0);
    });
  });

  describe('damage to mobs', () => {
    it('falls off with distance: closer takes more, the edge still takes the minimum', () => {
      const near = placeMob(0.5);
      const far = placeMob(3.9);
      boom(4);
      const base = MINING_CONFIG.EXPLOSION_DEFAULT_DAMAGE;
      expect(1000 - near.health).toBeCloseTo(blastDamageAt(0.5, 4, base), 6);
      expect(1000 - far.health).toBeCloseTo(blastDamageAt(3.9, 4, base), 6);
      expect(1000 - near.health).toBeGreaterThan(1000 - far.health);
      expect(1000 - far.health).toBeGreaterThanOrEqual(base * MINING_CONFIG.EXPLOSION_MIN_DAMAGE_FRACTION - 1e-6);
    });

    it('does not reach mobs outside the radius', () => {
      const out = placeMob(5);
      boom(4);
      expect(out.health).toBe(1000);
    });

    it('is not stopped by walls: only distance reduces the damage', () => {
      const behindWall = placeMob(3);
      const open = placeMob(-3);
      boom(5);
      expect(1000 - behindWall.health).toBeCloseTo(blastDamageAt(3, 5, MINING_CONFIG.EXPLOSION_DEFAULT_DAMAGE), 6);
      expect(behindWall.health).toBeCloseTo(open.health, 6);
    });

    it('takes its strength from the explosive item\'s Damage effect when it has one', () => {
      const real = engine.dataManager.getItemData.bind(engine.dataManager);
      vi.spyOn(engine.dataManager, 'getItemData').mockImplementation((id: string) =>
        id === 'big-bomb'
          ? partialDefinitions({ items: [{ id, name: 'Big Bomb', itemEffects: [{ value: 200, effect: { damageModifier: true } }] }] }).items[0]
          : real(id)
      );
      const mob = placeMob(0);
      boom(4, 'big-bomb');
      expect(1000 - mob.health).toBeCloseTo(200, 6);
    });

    it('knocks movable mobs away from the centre', () => {
      const right = placeMob(1);
      boom(4);
      expect(right.mobBody.velocity.x).toBeGreaterThan(0);
      expect(right.mobBody.velocity.y).toBeLessThan(0);
    });
  });

  describe('damage to players', () => {
    it('hurts a player in the blast (the thrower included) exactly as much as a mob, and pushes them away', () => {
      me().playerBody.position = { x: CX + 1, y: CY };
      boom(4);
      const expected = blastDamageAt(1, 4, MINING_CONFIG.EXPLOSION_DEFAULT_DAMAGE);
      expect(me().maxHealth - me().health).toBeCloseTo(expected, 4);
      expect(me().playerBody.velocity.x).toBeGreaterThan(0);
    });

    it('does not hurt a player outside the radius', () => {
      boom(4); // player is at (5.5, 5.5), far away
      expect(me().health).toBe(me().maxHealth);
    });

    it('hurts a player behind a wall the same as one in the open', () => {
      me().playerBody.position = { x: CX + 3, y: CY };
      boom(5);
      expect(me().maxHealth - me().health).toBeCloseTo(blastDamageAt(3, 5, MINING_CONFIG.EXPLOSION_DEFAULT_DAMAGE), 4);
    });
  });
});
