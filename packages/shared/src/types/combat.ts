

export type CombatActionType = 'Attack' | 'Defend';

export interface CombatAction {
  type: CombatActionType;
  actorId: string; // The characterId or mob id
  targetId: string; // The mob id or characterId being targeted
}

export interface MobBattleState {
  id: string; // The specific DungeonLevelMob id (unique identifier for this specific mob in the battle)
  mobId: string; // The base Mob id
  name: string;
  level: number;
  health: number;
  maxHealth: number;
  attack: number;
  defense: number;
  attackPercentage: number;
  defendPercentage: number;
  animations: any;
  // Tracking state for naive AI
  consecutiveAttacks: number;
  consecutiveDefends: number;
  // The action it intends to take this turn
  intendedAction?: CombatActionType;
}

export interface CombatLogMessage {
  id: string;
  message: string;
  type: 'damage' | 'defense' | 'info' | 'system' | 'loot';
  actorName?: string;
  targetName?: string;
}

/**
 * Represents a single damage/heal event that occurred during a combat round.
 * Used by the client to render floating damage indicators over entities.
 */
export interface DamageEvent {
  /** The entity that received the effect — 'player' for the character, or a mob id */
  targetId: string;
  /** Positive = damage dealt, negative = healing received */
  amount: number;
  /** The visual category of the event */
  type: 'damage' | 'heal' | 'blocked' | 'critical';
  /** The entity that caused the effect */
  sourceId?: string;
}

export interface BattleState {
  id: string;
  characterId: string;
  dungeonLevelId: string;
  round: number;
  turn: 'PLAYER' | 'MOB';
  status: 'IN_PROGRESS' | 'VICTORY' | 'DEFEAT' | 'FLED';
  mobs: MobBattleState[];
  playerHealth: number;
  playerMaxHealth: number;
  rngSeed: string; // Used to sync determinism if needed
  turnLogs?: CombatLogMessage[];
  /** Structured damage/heal events for this round, used by floating damage indicators */
  damageEvents?: DamageEvent[];
  /** The next dungeon level id to advance to, or null/undefined if this is the last level */
  nextDungeonLevelId?: string | null;
  /** True when completing this level also completes the entire dungeon */
  isDungeonComplete?: boolean;
}
