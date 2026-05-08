import { describe, it, expect } from 'vitest';
import { CombatEngine } from '../src/gameLogic/CombatEngine';
import type { BattleState, CombatAction, PlayerState, MobBattleState } from '../src/types';

/**
 * Tests for the damageEvents feature in CombatEngine.processTurn().
 * Verifies that structured DamageEvent entries are emitted alongside
 * the existing turnLogs for each combat interaction.
 */
describe('CombatEngine — damageEvents', () => {
  const makeMob = (overrides: Partial<MobBattleState> = {}): MobBattleState => ({
    id: 'mob_1',
    mobId: 'base_mob_1',
    name: 'Slime',
    level: 1,
    health: 100,
    maxHealth: 100,
    attack: 8,
    defense: 2,
    attackPercentage: 70,
    defendPercentage: 30,
    animations: {},
    consecutiveAttacks: 0,
    consecutiveDefends: 0,
    ...overrides,
  });

  const makePlayer = (overrides: Partial<PlayerState> = {}): PlayerState => ({
    id: 'player_1',
    familyName: 'Test',
    characterName: 'Hero',
    characterClass: 'Warrior',
    sol: 0,
    lear: 0,
    cityId: 'city_1',
    attributes: {
      level: 1,
      combatScore: 10,
      defenseScore: 5,
      stamina: 100,
      maxStamina: 100,
      ageInDays: 7300,
      health: 100,
      maxHealth: 100,
    },
    inventory: { slots: 25, items: [] },
    gear: {},
    ...overrides,
  });

  const makeState = (overrides: Partial<BattleState> = {}): BattleState => ({
    id: 'battle_1',
    characterId: 'char_1',
    dungeonLevelId: 'level_1',
    round: 1,
    turn: 'PLAYER',
    status: 'IN_PROGRESS',
    mobs: [makeMob()],
    playerHealth: 100,
    playerMaxHealth: 100,
    rngSeed: 'test_seed',
    ...overrides,
  });

  it('should populate damageEvents when player attacks a mob', () => {
    const state = makeState();
    const player = makePlayer();

    const playerActions: CombatAction[] = [
      { type: 'Attack', actorId: 'char_1', targetId: 'mob_1' },
    ];
    const mobActions: CombatAction[] = [
      { type: 'Defend', actorId: 'mob_1', targetId: 'char_1' },
    ];

    const result = CombatEngine.processTurn(state, player, playerActions, mobActions);

    expect(result.damageEvents).toBeDefined();
    expect(result.damageEvents!.length).toBeGreaterThan(0);

    // Player attacked mob while mob was defending → blocked
    const mobEvent = result.damageEvents!.find(e => e.targetId === 'mob_1');
    expect(mobEvent).toBeDefined();
    expect(mobEvent!.type).toBe('blocked');
    expect(mobEvent!.amount).toBeGreaterThan(0);
    expect(mobEvent!.sourceId).toBe('player');
  });

  it('should emit a damage event on the mob when player attacks without block', () => {
    const state = makeState();
    const player = makePlayer();

    const playerActions: CombatAction[] = [
      { type: 'Attack', actorId: 'char_1', targetId: 'mob_1' },
    ];
    const mobActions: CombatAction[] = [
      { type: 'Attack', actorId: 'mob_1', targetId: 'char_1' },
    ];

    const result = CombatEngine.processTurn(state, player, playerActions, mobActions);

    const mobEvent = result.damageEvents!.find(e => e.targetId === 'mob_1');
    expect(mobEvent).toBeDefined();
    expect(mobEvent!.type).toBe('damage');
    expect(mobEvent!.amount).toBe(10); // combatScore = 10
  });

  it('should emit a damage event on the player when mob attacks', () => {
    const state = makeState();
    const player = makePlayer();

    const playerActions: CombatAction[] = [
      { type: 'Attack', actorId: 'char_1', targetId: 'mob_1' },
    ];
    const mobActions: CombatAction[] = [
      { type: 'Attack', actorId: 'mob_1', targetId: 'char_1' },
    ];

    const result = CombatEngine.processTurn(state, player, playerActions, mobActions);

    const playerEvent = result.damageEvents!.find(e => e.targetId === 'player');
    expect(playerEvent).toBeDefined();
    expect(playerEvent!.type).toBe('damage');
    expect(playerEvent!.amount).toBe(8); // mob.attack = 8
    expect(playerEvent!.sourceId).toBe('mob_1');
  });

  it('should emit a blocked event on the player when player defends a mob attack', () => {
    const state = makeState();
    const player = makePlayer();

    const playerActions: CombatAction[] = [
      { type: 'Defend', actorId: 'char_1', targetId: 'mob_1' },
    ];
    const mobActions: CombatAction[] = [
      { type: 'Attack', actorId: 'mob_1', targetId: 'char_1' },
    ];

    const result = CombatEngine.processTurn(state, player, playerActions, mobActions);

    const playerEvent = result.damageEvents!.find(e => e.targetId === 'player');
    expect(playerEvent).toBeDefined();
    expect(playerEvent!.type).toBe('blocked');
    // 8 * 0.2 = 1.6 -> floor = 1
    expect(playerEvent!.amount).toBe(1);
  });

  it('should have no damageEvents when both sides defend', () => {
    const state = makeState();
    const player = makePlayer();

    const playerActions: CombatAction[] = [
      { type: 'Defend', actorId: 'char_1', targetId: 'mob_1' },
    ];
    const mobActions: CombatAction[] = [
      { type: 'Defend', actorId: 'mob_1', targetId: 'char_1' },
    ];

    const result = CombatEngine.processTurn(state, player, playerActions, mobActions);

    expect(result.damageEvents).toBeDefined();
    expect(result.damageEvents!.length).toBe(0);
  });

  it('should emit events for multiple mobs', () => {
    const mob1 = makeMob({ id: 'mob_1', name: 'Slime A' });
    const mob2 = makeMob({ id: 'mob_2', name: 'Slime B', attack: 5 });
    const state = makeState({ mobs: [mob1, mob2] });
    const player = makePlayer();

    const playerActions: CombatAction[] = [
      { type: 'Attack', actorId: 'char_1', targetId: 'mob_1' },
      { type: 'Attack', actorId: 'char_1', targetId: 'mob_2' },
    ];
    const mobActions: CombatAction[] = [
      { type: 'Attack', actorId: 'mob_1', targetId: 'char_1' },
      { type: 'Attack', actorId: 'mob_2', targetId: 'char_1' },
    ];

    const result = CombatEngine.processTurn(state, player, playerActions, mobActions);

    // 2 damage events on mobs + 2 damage events on player = 4 total
    expect(result.damageEvents!.length).toBe(4);

    const mob1Events = result.damageEvents!.filter(e => e.targetId === 'mob_1');
    expect(mob1Events.length).toBe(1);

    const mob2Events = result.damageEvents!.filter(e => e.targetId === 'mob_2');
    expect(mob2Events.length).toBe(1);

    const playerEvents = result.damageEvents!.filter(e => e.targetId === 'player');
    expect(playerEvents.length).toBe(2);
  });

  it('should reset damageEvents each round (not accumulate)', () => {
    const state = makeState();
    const player = makePlayer();

    const playerActions: CombatAction[] = [
      { type: 'Attack', actorId: 'char_1', targetId: 'mob_1' },
    ];
    const mobActions: CombatAction[] = [
      { type: 'Attack', actorId: 'mob_1', targetId: 'char_1' },
    ];

    // Round 1
    const round1 = CombatEngine.processTurn(state, player, playerActions, mobActions);
    const round1EventCount = round1.damageEvents!.length;

    // Round 2 — using round1 as input
    const round2 = CombatEngine.processTurn(round1, player, playerActions, mobActions);

    // Round 2 should have its own events, not round1's events accumulated
    expect(round2.damageEvents!.length).toBe(round1EventCount);
    // They are fresh events, not carried from round1
    expect(round2.damageEvents).not.toBe(round1.damageEvents);
  });
});
