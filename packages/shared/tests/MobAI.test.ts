import { describe, it, expect, beforeEach } from 'vitest';
import { MobAIRegistry } from '../src/gameLogic/ai/MobAIRegistry';
import { ChaseAndMineAI } from '../src/gameLogic/ai/ChaseAndMineAI';
import { PatrolAI } from '../src/gameLogic/ai/PatrolAI';
import { BaseMobAbility, type MobAbilityContext } from '../src/gameLogic/abilities/BaseMobAbility';
import { MiningTileType } from '../src/types/mining';
import type { MobAIContext } from '../src/gameLogic/ai/BaseMobAI';
import type { MiningCollisionGrid } from '../src/physics/MiningPhysicsBody';

describe('MobAI System', () => {
  let grid: MiningCollisionGrid;

  beforeEach(() => {
    grid = {};
    for (let y = 0; y < 20; y++) {
      grid[y] = {};
      for (let x = 0; x < 20; x++) {
        grid[y][x] = { type: y >= 10 ? MiningTileType.DIRT : MiningTileType.EMPTY };
      }
    }
  });

  describe('MobAIRegistry', () => {
    it('creates ChaseAndMineAI for CHASE_AND_MINE type', () => {
      const ai = MobAIRegistry.create('CHASE_AND_MINE', 'mob_1', 'inst_1');
      expect(ai).toBeInstanceOf(ChaseAndMineAI);
    });

    it('creates PatrolAI for PATROL type', () => {
      const ai = MobAIRegistry.create('PATROL', 'mob_1', 'inst_1');
      expect(ai).toBeInstanceOf(PatrolAI);
    });

    it('defaults to ChaseAndMineAI for unknown AI types', () => {
      const ai = MobAIRegistry.create('UNKNOWN_CUSTOM', 'mob_1', 'inst_1');
      expect(ai).toBeInstanceOf(ChaseAndMineAI);
    });
  });

  describe('ChaseAndMineAI', () => {
    it('remains idle when no players are within aggro range', () => {
      const ai = new ChaseAndMineAI('mob_1', 'inst_1');
      const context: MobAIContext = {
        mobId: 'mob_1',
        instanceId: 'inst_1',
        position: { x: 5, y: 9 },
        velocity: { x: 0, y: 0 },
        health: 50,
        maxHealth: 50,
        attack: 10,
        defense: 2,
        isGrounded: true,
        isOnLadder: false,
        grid,
        players: [
          {
            characterId: 'char_far',
            position: { x: 100, y: 9 }, // Outside aggro range
            health: 100,
          },
        ],
        config: { aggroRange: 15 },
      };

      const intent = ai.update(0.1, context);
      expect(intent.isAttacking).toBe(false);
      expect(intent.isMining).toBe(false);
      expect(intent.moveX).toBe(0);
      expect(intent.animationState).toBe('idle');
    });

    it('triggers attack when within melee attack range of player', () => {
      const ai = new ChaseAndMineAI('mob_1', 'inst_1');
      const context: MobAIContext = {
        mobId: 'mob_1',
        instanceId: 'inst_1',
        position: { x: 5, y: 9 },
        velocity: { x: 0, y: 0 },
        health: 50,
        maxHealth: 50,
        attack: 10,
        defense: 2,
        isGrounded: true,
        isOnLadder: false,
        grid,
        players: [
          {
            characterId: 'char_near',
            position: { x: 5.8, y: 9 }, // Within 1.25 attack range
            health: 100,
          },
        ],
        config: { attackRange: 1.25, attackCooldownMs: 1000 },
      };

      const intent = ai.update(0.1, context);
      expect(intent.isAttacking).toBe(true);
      expect(intent.attackTargetId).toBe('char_near');
      expect(intent.animationState).toBe('attack');

      // Next tick immediately after attack should be on cooldown
      const intent2 = ai.update(0.1, context);
      expect(intent2.isAttacking).toBe(false);
    });

    it('chases and navigates towards player in aggro range', () => {
      const ai = new ChaseAndMineAI('mob_1', 'inst_1');
      const context: MobAIContext = {
        mobId: 'mob_1',
        instanceId: 'inst_1',
        position: { x: 5, y: 9 },
        velocity: { x: 0, y: 0 },
        health: 50,
        maxHealth: 50,
        attack: 10,
        defense: 2,
        isGrounded: true,
        isOnLadder: false,
        grid,
        players: [
          {
            characterId: 'char_mid',
            position: { x: 9, y: 9 },
            health: 100,
          },
        ],
        config: { aggroRange: 20 },
      };

      const intent = ai.update(0.1, context);
      // Mob should move to the right towards x=9
      expect(intent.moveX).toBeGreaterThan(0);
      expect(intent.animationState).toBe('walk');
    });

    it('emits MINE intent when obstacle block is in path', () => {
      // Place solid block at x=6, y=9
      grid[9][6] = { type: MiningTileType.DIRT };

      const ai = new ChaseAndMineAI('mob_1', 'inst_1');
      const context: MobAIContext = {
        mobId: 'mob_1',
        instanceId: 'inst_1',
        position: { x: 5, y: 9 },
        velocity: { x: 0, y: 0 },
        health: 50,
        maxHealth: 50,
        attack: 10,
        defense: 2,
        isGrounded: true,
        isOnLadder: false,
        grid,
        players: [
          {
            characterId: 'char_behind_wall',
            position: { x: 7, y: 9 },
            health: 100,
          },
        ],
        config: { aggroRange: 20, canMine: true },
      };

      const intent = ai.update(0.1, context);
      expect(intent.isMining).toBe(true);
      expect(intent.miningTarget).toEqual({ x: 6, y: 9 });
      expect(intent.animationState).toBe('mine');

      // Now simulate block breaking (becoming EMPTY)
      grid[9][6] = { type: MiningTileType.EMPTY };
      const intentAfterBreak = ai.update(0.1, context);
      // Waypoint should advance and mob should move forward into opened space
      expect(intentAfterBreak.isMining).toBe(false);
      expect(intentAfterBreak.moveX).toBeGreaterThan(0);
      expect(intentAfterBreak.animationState).toBe('walk');
    });

    it('advances waypoints with floating point physics coordinates on ground', () => {
      const ai = new ChaseAndMineAI('mob_1', 'inst_1');
      const context: MobAIContext = {
        mobId: 'mob_1',
        instanceId: 'inst_1',
        position: { x: 5.5, y: 9.5625 }, // Resting on floor at y=10
        velocity: { x: 0, y: 0 },
        health: 50,
        maxHealth: 50,
        attack: 10,
        defense: 2,
        isGrounded: true,
        isOnLadder: false,
        grid,
        players: [
          {
            characterId: 'char_ahead',
            position: { x: 8.5, y: 9.5625 },
            health: 100,
          },
        ],
        config: { aggroRange: 20 },
      };

      const intent = ai.update(0.1, context);
      // Mob should walk towards player
      expect(intent.moveX).toBeGreaterThan(0);
      expect(intent.animationState).toBe('walk');
    });

    it('jumps over a 1-tile obstacle when facing it with headroom', () => {
      // Place solid block at x=6, y=9 with open space above at y=8
      grid[9][6] = { type: MiningTileType.DIRT };
      grid[8][6] = { type: MiningTileType.EMPTY };
      grid[8][5] = { type: MiningTileType.EMPTY };

      const ai = new ChaseAndMineAI('mob_1', 'inst_1');
      const context: MobAIContext = {
        mobId: 'mob_1',
        instanceId: 'inst_1',
        position: { x: 5.6, y: 9 }, // Right in front of x=6
        velocity: { x: 0, y: 0 },
        health: 50,
        maxHealth: 50,
        attack: 10,
        defense: 2,
        isGrounded: true,
        isOnLadder: false,
        grid,
        players: [
          {
            characterId: 'char_ahead',
            position: { x: 8, y: 9 },
            health: 100,
          },
        ],
        config: { aggroRange: 20, canMine: false },
      };

      const intent = ai.update(0.1, context);
      expect(intent.jump).toBe(true);
      expect(intent.moveX).toBeGreaterThan(0);
      expect(intent.animationState).toBe('jump');
    });

    it('walks towards a distant MINE waypoint and does not emit isMining until within reach', () => {
      // Build a solid wall at x=15 to block direct walking
      grid[9][15] = { type: MiningTileType.DIRT };
      grid[8][15] = { type: MiningTileType.DIRT };

      const ai = new ChaseAndMineAI('mob_1', 'inst_1');

      const context: MobAIContext = {
        mobId: 'mob_1',
        instanceId: 'inst_1',
        position: { x: 10, y: 9 }, // 5 tiles away from wall at x=15
        velocity: { x: 0, y: 0 },
        health: 50,
        maxHealth: 50,
        attack: 10,
        defense: 2,
        isGrounded: true,
        isOnLadder: false,
        grid,
        players: [{ characterId: 'p1', position: { x: 16, y: 9 }, health: 100 }],
        config: { aggroRange: 20, mineRange: 1.85, canMine: true },
      };

      const intent = ai.update(0.1, context);
      // Mob must WALK towards the wall first, NOT start mining it from 5 tiles away!
      expect(intent.isMining).toBe(false);
      expect(intent.miningTarget).toBeNull();
      expect(intent.moveX).toBe(1);
      expect(intent.animationState).toBe('walk');

      // Now position mob right in front of the wall at x=14.0 (distance 1.5 tiles <= 1.85 reach)
      const nearContext: MobAIContext = {
        ...context,
        position: { x: 14.0, y: 9 },
      };
      const nearAi = new ChaseAndMineAI('mob_1', 'inst_2');
      const intentInReach = nearAi.update(0.1, nearContext);
      expect(intentInReach.isMining).toBe(true);
      expect(intentInReach.miningTarget).toEqual({ x: 15, y: 9 });
      expect(intentInReach.animationState).toBe('mine');
    });
  });

  describe('PatrolAI', () => {
    it('moves back and forth within patrol radius', () => {
      const ai = new PatrolAI('mob_1', 'inst_1');
      const context: MobAIContext = {
        mobId: 'mob_1',
        instanceId: 'inst_1',
        position: { x: 10, y: 9 },
        velocity: { x: 0, y: 0 },
        health: 50,
        maxHealth: 50,
        attack: 10,
        defense: 2,
        isGrounded: true,
        isOnLadder: false,
        grid,
        players: [],
        config: { patrolRadius: 5 },
      };

      // Moving right initially
      const intent1 = ai.update(0.1, context);
      expect(intent1.moveX).toBe(1);

      // Moved past right patrol limit
      context.position.x = 16;
      const intent2 = ai.update(0.1, context);
      expect(intent2.moveX).toBe(-1);
    });
  });

  describe('BaseMobAbility', () => {
    class MockDashAbility extends BaseMobAbility {
      public readonly id = 'dash';
      public readonly name = 'Dash';
      public readonly cooldownSeconds = 3.0;

      public activate(context: MobAbilityContext): void {
        this.currentCooldown = this.cooldownSeconds;
      }
    }

    it('tracks ability cooldown and readiness', () => {
      const ability = new MockDashAbility();
      expect(ability.isReady).toBe(true);

      ability.activate({} as any);
      expect(ability.isReady).toBe(false);
      expect(ability.cooldownRemaining).toBe(3.0);

      ability.update(1.0);
      expect(ability.cooldownRemaining).toBe(2.0);
      expect(ability.isReady).toBe(false);

      ability.update(2.0);
      expect(ability.isReady).toBe(true);
      expect(ability.cooldownRemaining).toBe(0);
    });
  });
});
