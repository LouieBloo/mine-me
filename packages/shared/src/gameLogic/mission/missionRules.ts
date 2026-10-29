import { MAX_MISSION_OBJECTIVES, MISSION_OFFER_MAX, MISSION_OFFER_MIN, type MissionDefinition, type MissionRewardItem } from '../../types/mission';
import { validateObjective, type MissionLookups } from './objectiveTypes';

const MISSION_KEY = /^[a-z][a-z0-9_]*$/;
const isWhole = (v: unknown, min: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min;

/** Problems with one reward item, one message each. */
export function validateRewardItem(item: Partial<MissionRewardItem> | null | undefined, lookups: Pick<MissionLookups, 'hasItem'>): string[] {
  if (!item || typeof item !== 'object') return ['a reward item is missing'];
  const errors: string[] = [];
  if (typeof item.itemId !== 'string' || !lookups.hasItem(item.itemId)) errors.push(`reward: unknown item "${String(item.itemId)}"`);
  if (typeof item.chance !== 'number' || !Number.isFinite(item.chance) || item.chance < 0 || item.chance > 100) errors.push('reward: chance must be from 0 to 100');
  if (!isWhole(item.minQuantity, 1)) errors.push('reward: minimum quantity must be a whole number of at least 1');
  if (!isWhole(item.maxQuantity, 1)) errors.push('reward: maximum quantity must be a whole number of at least 1');
  else if (isWhole(item.minQuantity, 1) && item.maxQuantity < item.minQuantity) errors.push('reward: maximum quantity cannot be below the minimum');
  return errors;
}

/** Problems with a mission definition, one message each (empty when it is valid). */
export function validateMission(mission: Partial<MissionDefinition>, lookups: MissionLookups): string[] {
  const errors: string[] = [];
  if (typeof mission.key !== 'string' || !MISSION_KEY.test(mission.key)) errors.push('key must be lower case letters, digits and underscores, starting with a letter');
  if (typeof mission.name !== 'string' || mission.name.trim() === '') errors.push('name is required');
  if (!isWhole(mission.minLevel, 1)) errors.push('minimum level must be a whole number of at least 1');
  if (!isWhole(mission.maxLevel, 1)) errors.push('maximum level must be a whole number of at least 1');
  else if (isWhole(mission.minLevel, 1) && mission.minLevel > mission.maxLevel) errors.push('minimum level cannot be above the maximum level');
  if (!isWhole(mission.tier, 1)) errors.push('tier must be a whole number of at least 1');
  if (typeof mission.weight !== 'number' || !Number.isFinite(mission.weight) || mission.weight <= 0) errors.push('weight must be greater than 0');
  if (!isWhole(mission.rewardSol ?? 0, 0)) errors.push('Sol must be a whole number, 0 or more');
  if (!isWhole(mission.rewardXp ?? 0, 0)) errors.push('XP must be a whole number, 0 or more');
  const objectives = mission.objectives;
  if (!Array.isArray(objectives) || objectives.length === 0) errors.push('a mission needs at least one objective');
  else {
    if (objectives.length > MAX_MISSION_OBJECTIVES) errors.push(`a mission can have at most ${MAX_MISSION_OBJECTIVES} objectives`);
    objectives.forEach((o, i) => validateObjective(o, lookups).forEach((e) => errors.push(`objective ${i + 1}: ${e}`)));
  }
  const rewardItems = mission.rewardItems ?? [];
  if (!Array.isArray(rewardItems)) errors.push('reward items must be a list');
  else rewardItems.forEach((r) => validateRewardItem(r, lookups).forEach((e) => errors.push(e)));
  return errors;
}

/** The missions a character of `level` may be offered: in their level range, with weight and objectives. */
export function missionsForLevel<M extends Pick<MissionDefinition, 'minLevel' | 'maxLevel' | 'weight' | 'objectives'>>(missions: readonly M[], level: number): M[] {
  return missions.filter((m) => level >= m.minLevel && level <= m.maxLevel && m.weight > 0 && m.objectives.length > 0);
}

/**
 * Rolls the missions a run offers: distinct, drawn by weight from those that fit `level`. Takes between MISSION_OFFER_MIN and
 * MISSION_OFFER_MAX (or all there are, when fewer fit). `rng` returns [0, 1); the same rng sequence gives the same offers.
 */
export function rollMissionOffers<M extends Pick<MissionDefinition, 'minLevel' | 'maxLevel' | 'weight' | 'objectives'>>(
  missions: readonly M[],
  level: number,
  rng: () => number = Math.random
): M[] {
  const pool = missionsForLevel(missions, level);
  if (pool.length === 0) return [];
  const wanted = Math.min(pool.length, MISSION_OFFER_MIN + Math.floor(rng() * (MISSION_OFFER_MAX - MISSION_OFFER_MIN + 1)));
  const offers: M[] = [];
  const remaining = [...pool];
  while (offers.length < wanted && remaining.length > 0) {
    const total = remaining.reduce((sum, m) => sum + m.weight, 0);
    let roll = rng() * total;
    let index = remaining.length - 1;
    for (let i = 0; i < remaining.length; i++) {
      roll -= remaining[i].weight;
      if (roll < 0) {
        index = i;
        break;
      }
    }
    offers.push(remaining[index]);
    remaining.splice(index, 1);
  }
  return offers;
}

/** How often each mission in the pool is expected to be on offer for `level`, as a share of rolls (for the admin's simulation). */
export function simulateOffers<M extends Pick<MissionDefinition, 'minLevel' | 'maxLevel' | 'weight' | 'objectives'>>(
  missions: readonly M[],
  level: number,
  rolls: number,
  rng: () => number
): Map<M, number> {
  const counts = new Map<M, number>();
  for (let i = 0; i < rolls; i++) for (const m of rollMissionOffers(missions, level, rng)) counts.set(m, (counts.get(m) ?? 0) + 1);
  return new Map([...counts].map(([m, n]) => [m, n / rolls]));
}
