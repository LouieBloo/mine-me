// ============================================================================
// Game Event Types — Discriminated Union Pattern
//
// All game actions sent over the character WebSocket use a single 'game_event'
// channel. Each payload has a `type` discriminator so the server can dispatch
// to the correct handler.
//
// To add a new event:
//   1. Define a new interface extending GameEventBase
//   2. Add it to the GameEventPayload union
//   3. Add a handler on the server in sockets/gameEvents.ts
// ============================================================================

/** Base interface — every game event must have a type discriminator. */
export interface GameEventBase {
  type: string;
}

// ----------------------------------------------------------------------------
// Event: change_city
// Moves the character to a different city. Server calculates travel distance
// and increments ageInDays accordingly.
// ----------------------------------------------------------------------------
export interface ChangeCityPayload extends GameEventBase {
  type: 'change_city';
  cityId: string;
}

// ----------------------------------------------------------------------------
// Event: start_combat
// Initializes a battle against mobs in a specific dungeon level
// ----------------------------------------------------------------------------
export interface StartCombatPayload extends GameEventBase {
  type: 'start_combat';
  cityId: string;
  dungeonLevelId: string;
}

// ----------------------------------------------------------------------------
// Event: combat_action
// Submits player combat actions for a round
// ----------------------------------------------------------------------------
export interface CombatActionPayload extends GameEventBase {
  type: 'combat_action';
  actions: { targetId: string, action: 'Attack' | 'Defend' }[];
}

// ----------------------------------------------------------------------------
// Event: leave_combat
// Flees or leaves a completed battle
// ----------------------------------------------------------------------------
export interface LeaveCombatPayload extends GameEventBase {
  type: 'leave_combat';
}

// ----------------------------------------------------------------------------
// Event: advance_dungeon_level
// Advances to the next dungeon level after a VICTORY, starting a new battle.
// ----------------------------------------------------------------------------
export interface AdvanceDungeonLevelPayload extends GameEventBase {
  type: 'advance_dungeon_level';
}

// ----------------------------------------------------------------------------
// Event: rest
// Character rests to recover health and stamina at the cost of 1 day of age.
// ----------------------------------------------------------------------------
export interface RestPayload extends GameEventBase {
  type: 'rest';
  days?: number;
}

// ----------------------------------------------------------------------------
// Event: training_action
// Performs a training action (Attack or Defend) against the training dummy.
// Costs 20 stamina. Increases combatScore or defenseScore by 1.
// ----------------------------------------------------------------------------
export interface TrainingActionPayload extends GameEventBase {
  type: 'training_action';
  action: 'Attack' | 'Defend';
}

// ----------------------------------------------------------------------------
// Event: leave_training
// Exits the training grounds and returns to the city.
// ----------------------------------------------------------------------------
export interface LeaveTrainingPayload extends GameEventBase {
  type: 'leave_training';
}

// ----------------------------------------------------------------------------
// Event: mine
// Mines in the current city. Costs 25 stamina.
// ----------------------------------------------------------------------------
export interface MinePayload extends GameEventBase {
  type: 'mine';
}

// ----------------------------------------------------------------------------
// Event: equip_item
// Equips a gear item from inventory.
// ----------------------------------------------------------------------------
export interface EquipItemPayload extends GameEventBase {
  type: 'equip_item';
  inventoryItemId: string;
}

// ----------------------------------------------------------------------------
// Event: unequip_item
// Unequips a gear item.
// ----------------------------------------------------------------------------
export interface UnequipItemPayload extends GameEventBase {
  type: 'unequip_item';
  inventoryItemId: string;
}

// ----------------------------------------------------------------------------
// Union of all game event payloads.
// Extend this as new events are added.
// ----------------------------------------------------------------------------
export type GameEventPayload = ChangeCityPayload | StartCombatPayload | CombatActionPayload | LeaveCombatPayload | AdvanceDungeonLevelPayload | RestPayload | TrainingActionPayload | LeaveTrainingPayload | MinePayload | EquipItemPayload | UnequipItemPayload;

// Utility type: extract the type string literals from the union
export type GameEventType = GameEventPayload['type'];

// ----------------------------------------------------------------------------
// Server response — returned via the socket acknowledgement callback.
// ----------------------------------------------------------------------------
export interface GameEventResult {
  success: boolean;
  error?: string;
  /** Optional data returned by the handler (e.g. distance traveled). */
  data?: Record<string, any>;
}
