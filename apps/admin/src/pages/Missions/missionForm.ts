import { OBJECTIVE_TYPES, type MissionDefinition, type MissionRewardItem, type ObjectiveDefinition, type ObjectiveType } from '@mine-me/shared';

/** The edit state of a mission. Numbers may be NaN while their field is empty. */
export interface MissionForm {
  key: string;
  name: string;
  description: string;
  minLevel: number;
  maxLevel: number;
  tier: number;
  weight: number;
  objectives: ObjectiveDefinition[];
  rewardCoins: number;
  rewardXp: number;
  rewardItems: MissionRewardItem[];
}

/** What a new mission starts as: a one-objective, low-level, tier 1 mission with no reward items. */
export const NEW_MISSION: MissionForm = {
  key: '',
  name: '',
  description: '',
  minLevel: 1,
  maxLevel: 5,
  tier: 1,
  weight: 1,
  objectives: [{ type: 'MINE_ITEM', targetId: null, amount: 10 }],
  rewardCoins: 0,
  rewardXp: 0,
  rewardItems: [],
};

export const missionToForm = (m: MissionDefinition): MissionForm => ({
  key: m.key,
  name: m.name,
  description: m.description ?? '',
  minLevel: m.minLevel,
  maxLevel: m.maxLevel,
  tier: m.tier,
  weight: m.weight,
  objectives: (m.objectives ?? []).map((o) => ({ ...o })),
  rewardCoins: m.rewardCoins,
  rewardXp: m.rewardXp,
  rewardItems: (m.rewardItems ?? []).map((r) => ({ ...r })),
});

/** The body to send: text trimmed, an empty target dropped, nothing the server would refuse for shape. */
export const formToMission = (f: MissionForm): Partial<MissionDefinition> => ({
  key: f.key.trim(),
  name: f.name.trim(),
  description: f.description.trim() === '' ? null : f.description.trim(),
  minLevel: f.minLevel,
  maxLevel: f.maxLevel,
  tier: f.tier,
  weight: f.weight,
  objectives: f.objectives.map((o) => (o.targetId ? { type: o.type, targetId: o.targetId, amount: o.amount } : { type: o.type, amount: o.amount })),
  rewardCoins: Number.isFinite(f.rewardCoins) ? f.rewardCoins : 0,
  rewardXp: Number.isFinite(f.rewardXp) ? f.rewardXp : 0,
  rewardItems: f.rewardItems,
});

/** An objective of `type` with the defaults that fit it (changing the type clears the target, which no longer applies). */
export function newObjective(type: ObjectiveType): ObjectiveDefinition {
  const def = OBJECTIVE_TYPES[type];
  const amount = type === 'CLEAR_FLUID' || type === 'CLEAR_GAS' ? 30 : type === 'REACH_DEPTH' ? 45 : type === 'KILL_MOB' ? 3 : 10;
  return { type, targetId: def.targetKind ? null : undefined, amount: Math.min(def.maxAmount, Math.max(def.minAmount, amount)) };
}

/** A reward item row, with the first item's id when there is one. */
export const newRewardItem = (itemId = ''): MissionRewardItem => ({ itemId, chance: 100, minQuantity: 1, maxQuantity: 1 });

export const TIER_NAMES: Readonly<Record<number, string>> = { 1: 'Tier 1 (easy)', 2: 'Tier 2', 3: 'Tier 3 (hard)' };
export const tierName = (tier: number): string => TIER_NAMES[tier] ?? `Tier ${tier}`;
