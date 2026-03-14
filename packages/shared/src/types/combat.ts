export type CombatActionType = 'Attack' | 'Defend' | 'Ability' | 'Potion';

export interface CombatAction {
  type: CombatActionType;
  actorId: string;
  targetId: string;
  itemId?: string; // For potions
  abilityId?: string; // For abilities
}

export interface MobState {
  id: string;
  name: string;
  level: number;
  health: number;
  maxHealth: number;
  baseArmorScore: number;
  baseDamage: number;
  intendedAction?: CombatActionType; // The action telegraphed to the player
  actionTelegraphProbabilities: Record<CombatActionType, number>;
}

export interface CombatState {
  id: string;
  playerId: string;
  mob: MobState;
  turn: number;
  status: 'In_Progress' | 'Victory' | 'Defeat' | 'Fled';
  playerHealth: number;
  playerMaxHealth: number;
  playerStamina: number;
  playerMaxStamina: number;
  // Active buffs/potions modifiers
  playerDefenseModifier: number; 
  playerAttackModifier: number;
  mobDefenseModifier: number;
  mobAttackModifier: number;
}
