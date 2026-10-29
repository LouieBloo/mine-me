import type { MissionSoundEffectsConfig, MissionSoundSlotRefs } from './sound';

/**
 * Missions (tickets 108-116): a goal for a mine run. A mission is a data row (`MissionDefinition`) with typed objectives; the
 * rules of each objective type live in the registry (`OBJECTIVE_TYPES`), never in per-mission code.
 */

/** What an objective asks for. `PUMP_FLUID` is reserved for ticket 115 (pumps) and cannot be saved yet. */
export type ObjectiveType = 'MINE_ITEM' | 'KILL_MOB' | 'CLEAR_FLUID' | 'CLEAR_GAS' | 'REACH_DEPTH' | 'PUMP_FLUID';

/**
 * One objective of a mission.
 *  - MINE_ITEM: `targetId` = item id, `amount` = items collected into the backpack.
 *  - KILL_MOB: `targetId` = mob id (absent: any mob), `amount` = kills.
 *  - CLEAR_FLUID / CLEAR_GAS: `targetId` = fluid / gas id, `amount` = cells to clear (a full cell counts 1; partly filled cells add up), measured against what the map started with.
 *  - REACH_DEPTH: `amount` = depth below the surface, in small blocks (the original value x `BLOCK_SCALE`).
 */
export interface ObjectiveDefinition {
  type: ObjectiveType;
  targetId?: string | null;
  amount: number;
}

/** An item the reward may include; the same shape as a drop table entry (chance is a percent, 0-100). */
export interface MissionRewardItem {
  itemId: string;
  chance: number;
  minQuantity: number;
  maxQuantity: number;
}

/** A mission template as stored in the database and used by the offer roll, the tracker and the admin. */
export interface MissionDefinition {
  id: string;
  /** Open unique key, e.g. 'copper_run'. */
  key: string;
  name: string;
  description?: string | null;
  /** Character levels it may be offered to (inclusive). */
  minLevel: number;
  maxLevel: number;
  /** Difficulty tier, 1 = easiest. Shown on the card; harder tiers have more objectives and better rewards. */
  tier: number;
  /** Chance weight against the other missions on offer for a level. */
  weight: number;
  objectives: ObjectiveDefinition[];
  rewardSol: number;
  rewardXp: number;
  rewardItems: MissionRewardItem[];
  /** Sound slots as stored: library sounds by id (see `resolveMissionSounds`). */
  soundEffects?: MissionSoundSlotRefs | null;
  /** The same slots resolved to playable urls. Filled in when definitions load; never stored. */
  sounds?: MissionSoundEffectsConfig | null;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

/** The most objectives a mission may have. */
export const MAX_MISSION_OBJECTIVES = 5;
/** How many missions a run offers (the roll takes fewer when fewer fit). */
export const MISSION_OFFER_MIN = 2;
export const MISSION_OFFER_MAX = 4;

/** What a player sees of one objective, on a card, in the tracker and on the results screen. */
export interface MissionObjectiveView {
  type: ObjectiveType;
  /** "Mine 10 Copperium" */
  label: string;
  /** The goal in the objective's own unit (a count, a percent, a depth in small blocks). */
  target: number;
  progress: number;
  done: boolean;
  /** How progress reads: a count ("3 / 10"), a percent ("45%") or a depth ("12 / 40 m"). */
  unit: 'count' | 'percent' | 'depth';
}

/** What a reward is, as shown before and after a run (items by id with names resolved by the server). */
export interface MissionRewardView {
  sol: number;
  xp: number;
  items: { itemId: string; itemName: string; iconUrl?: string | null; chance: number; minQuantity: number; maxQuantity: number }[];
}

/** A mission offered before a run (no progress yet). */
export interface MissionOfferView {
  id: string;
  name: string;
  description?: string | null;
  tier: number;
  objectives: Pick<MissionObjectiveView, 'type' | 'label' | 'target' | 'unit'>[];
  reward: MissionRewardView;
}

/** The mission of a running mine, sent once at the start (and to a late joiner with its progress). */
export interface MissionClientState {
  id: string;
  name: string;
  description?: string | null;
  tier: number;
  objectives: MissionObjectiveView[];
  reward: MissionRewardView;
  completed: boolean;
  /** Library sounds for the objective and mission chimes, resolved to urls; absent: silent. */
  sounds?: MissionSoundEffectsConfig | null;
}

/** Progress that changed this tick: only the objectives that moved, by index. */
export interface MissionProgressDelta {
  objectives: { index: number; progress: number; done: boolean }[];
  /** True once every objective is done. */
  completed?: boolean;
}

/** The answer to "what is on offer": a roll for a new run, or the mission an existing room already has. */
export interface MissionOffersResponse {
  offers: MissionOfferView[];
  /** The player would join a room that already has this mission, so there is nothing to pick. */
  joining?: MissionClientState | null;
}

/** How a run ended for its mission, for the results screen and the end-of-run events. */
export interface MissionResultView {
  name: string;
  tier: number;
  outcome: 'paid' | 'completed' | 'failed' | 'unfinished';
  objectives: MissionObjectiveView[];
  /** What was paid on a safe exit (absent when nothing was). */
  reward?: { sol: number; xp: number; items: { itemId: string; itemName: string; iconUrl?: string | null; quantity: number }[] } | null;
  /** Who did how much of each objective (co-op). */
  contributions: { characterId: string; characterName: string; amounts: number[] }[];
  /** Why nothing was paid, when it was not. */
  reason?: string;
}
