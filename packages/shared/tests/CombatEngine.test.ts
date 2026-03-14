import { describe, it, expect } from 'vitest';
import { CombatEngine } from '../src/gameLogic/CombatEngine';
import { CombatState, PlayerState, CombatAction } from '../src/types';

describe('CombatEngine', () => {
  const mockMob = {
    id: 'mob_1',
    name: 'Slime',
    level: 1,
    health: 50,
    maxHealth: 50,
    baseArmorScore: 5,
    baseDamage: 10,
    actionTelegraphProbabilities: {
      'Attack': 80,
      'Defend': 20,
      'Ability': 0,
      'Potion': 0
    }
  };

  const mockPlayer: PlayerState = {
    id: 'player_1',
    familyName: 'Test',
    characterName: 'Hero',
    characterClass: 'Warrior',
    sol: 0,
    lear: 0,
    attributes: {
      level: 1,
      combatScore: 10,
      defenseScore: 5,
      stamina: 100,
      maxStamina: 100,
      age: 20
    },
    inventory: { slots: 25, items: [] },
    gear: {
      weapon: { id: 'w1', name: 'Sword', type: 'Weapon', damage: 20, priceSol: 10, description: 'Basic sword' }
    }
  };

  const initialState: CombatState = {
    id: 'combat_1',
    playerId: 'player_1',
    mob: { ...mockMob },
    turn: 0,
    status: 'In_Progress',
    playerHealth: 100,
    playerMaxHealth: 100,
    playerStamina: 100,
    playerMaxStamina: 100,
    playerDefenseModifier: 0,
    playerAttackModifier: 0,
    mobDefenseModifier: 0,
    mobAttackModifier: 0
  };

  it('should process a basic attack turn correctly', () => {
    const playerAction: CombatAction = { type: 'Attack', actorId: 'player_1', targetId: 'mob_1' };
    const mobAction: CombatAction = { type: 'Attack', actorId: 'mob_1', targetId: 'player_1' };

    const nextState = CombatEngine.processTurn(initialState, mockPlayer, playerAction, mobAction);

    // Player Damage to Mob: (20 Weapon - 5 Armor) * 1 * 1 = 15
    expect(nextState.mob.health).toBe(35);
    
    // Mob Damage to Player: (10 MobDamage - 0 Armor) * (1 - 5/100) * 1 = 10 * 0.95 = 9.5 -> floor 9
    expect(nextState.playerHealth).toBe(91); 
    expect(nextState.turn).toBe(1);
  });

  it('should detect victory when mob health reaches 0', () => {
    const weakMob = { ...initialState, mob: { ...initialState.mob, health: 10 } };
    const playerAction: CombatAction = { type: 'Attack', actorId: 'player_1', targetId: 'mob_1' };
    const mobAction: CombatAction = { type: 'Attack', actorId: 'mob_1', targetId: 'player_1' };

    const nextState = CombatEngine.processTurn(weakMob, mockPlayer, playerAction, mobAction);
    expect(nextState.status).toBe('Victory');
  });
});
