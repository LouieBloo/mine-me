import type { MiningPosition, MiningDirection } from './mining';

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
// Event: mining_start
// Begins a new mining mini-game session in the character's current city.
// ----------------------------------------------------------------------------
export interface MiningStartPayload extends GameEventBase {
  type: 'mining_start';
}

// ----------------------------------------------------------------------------
// Event: mining_move
// Moves the character one tile in a cardinal direction within the mine.
// ----------------------------------------------------------------------------
export interface MiningMovePayload extends GameEventBase {
  type: 'mining_move';
  direction: MiningDirection;
}

// ----------------------------------------------------------------------------
// Event: mining_mine_start
// Begin mining a block adjacent to the player. Server records timestamp.
// ----------------------------------------------------------------------------
export interface MiningMineStartPayload extends GameEventBase {
  type: 'mining_mine_start';
  target: MiningPosition;
}

// ----------------------------------------------------------------------------
// Event: mining_mine_complete
// Complete mining a block. Server validates elapsed time and awards loot.
// ----------------------------------------------------------------------------
export interface MiningMineCompletePayload extends GameEventBase {
  type: 'mining_mine_complete';
  target: MiningPosition;
}

// ----------------------------------------------------------------------------
// Event: mining_exit
// Leave the mine through the entrance tile. Transfers temp backpack to inventory.
// ----------------------------------------------------------------------------
export interface MiningExitPayload extends GameEventBase {
  type: 'mining_exit';
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
// Event: consume_item
// Consumes a consumable item from inventory.
// ----------------------------------------------------------------------------
export interface ConsumeItemPayload extends GameEventBase {
  type: 'consume_item';
  inventoryItemId: string;
}

// ----------------------------------------------------------------------------
// Union of all game event payloads.
// Extend this as new events are added.
// ----------------------------------------------------------------------------
export type GameEventPayload = ChangeCityPayload | RestPayload | TrainingActionPayload | LeaveTrainingPayload | MiningStartPayload | MiningMovePayload | MiningMineStartPayload | MiningMineCompletePayload | MiningExitPayload | EquipItemPayload | UnequipItemPayload | ConsumeItemPayload;

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
