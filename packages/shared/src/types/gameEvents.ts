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
// Union of all game event payloads.
// Extend this as new events are added.
// ----------------------------------------------------------------------------
export type GameEventPayload = ChangeCityPayload | StartCombatPayload | CombatActionPayload | LeaveCombatPayload;

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
