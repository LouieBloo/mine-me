import {
  rollMissionOffers,
  type MissionDefinition,
  type MissionOfferView,
  type MissionOffersResponse,
  OBJECTIVE_TYPES,
  describeObjective,
} from '@mine-me/shared';
import { MiningDataManager } from './mining/subsystems/MiningDataManager';
import { missionLookups, rewardView } from './mining/missions/missionContext';

/** How long a roll stays valid if the player does not start a run (they are not re-rolled by asking again). */
export const MISSION_OFFER_TTL_MS = 30 * 60 * 1000;

interface StoredOffers {
  missionIds: string[];
  at: number;
}

/** A level from the character's experience and the configured levels (the same rule as `CharacterService.addExperience`). */
export function levelFromXp(levels: ReadonlyArray<{ level: number; xpRequired: number }>, xp: number): number {
  if (levels.length === 0) return 1;
  const sorted = [...levels].sort((a, b) => a.level - b.level);
  for (let i = sorted.length - 1; i >= 0; i--) if (xp >= sorted[i].xpRequired) return Math.max(1, sorted[i].level);
  return Math.max(1, sorted[0].level - 1);
}

/** A mission as a player sees it before the run: objectives written out, rewards with item names. */
export function toOfferView(mission: MissionDefinition, data: MiningDataManager): MissionOfferView {
  const lookups = missionLookups(data);
  return {
    id: mission.id,
    name: mission.name,
    description: mission.description ?? null,
    tier: mission.tier,
    objectives: mission.objectives.map((o) => ({ type: o.type, label: describeObjective(o, lookups), target: o.amount, unit: OBJECTIVE_TYPES[o.type].unit })),
    reward: rewardView(mission, data),
  };
}

/**
 * The missions a run offers (ticket 111). A roll is made once per character and kept (so a refresh or reconnect shows the same
 * list, and there is no re-roll); a pick is only accepted from what was offered, and uses the roll up.
 */
export class MissionOfferService {
  private static readonly pending = new Map<string, StoredOffers>();

  /** The offers for a character of `level`: the kept roll if there is one, else a fresh one. Empty when no mission fits. */
  public static offersFor(characterId: string, level: number, data: MiningDataManager = MiningDataManager.getInstance(), now: number = Date.now(), rng: () => number = Math.random): MissionOfferView[] {
    const missions = data.getMissions();
    let stored = MissionOfferService.pending.get(characterId);
    // A kept roll is dropped when it is old, or when an admin edit removed one of its missions
    if (stored && (now - stored.at > MISSION_OFFER_TTL_MS || stored.missionIds.some((id) => !data.getMission(id)))) stored = undefined;
    if (!stored) {
      const rolled = rollMissionOffers(missions, level, rng);
      if (rolled.length === 0) {
        MissionOfferService.pending.delete(characterId);
        return [];
      }
      stored = { missionIds: rolled.map((m) => m.id), at: now };
      MissionOfferService.pending.set(characterId, stored);
    }
    return stored.missionIds.map((id) => data.getMission(id)).filter((m): m is MissionDefinition => Boolean(m)).map((m) => toOfferView(m, data));
  }

  /** The mission a character picked, if it was one of their offers. Using it up means a later run rolls again. */
  public static take(characterId: string, missionId: string, data: MiningDataManager = MiningDataManager.getInstance(), now: number = Date.now()): MissionDefinition | undefined {
    const stored = MissionOfferService.pending.get(characterId);
    if (!stored || now - stored.at > MISSION_OFFER_TTL_MS || !stored.missionIds.includes(missionId)) return undefined;
    const mission = data.getMission(missionId);
    if (mission) MissionOfferService.pending.delete(characterId);
    return mission;
  }

  /** Forgets a character's roll (a run started without a pick, or the sandbox). */
  public static clear(characterId: string): void {
    MissionOfferService.pending.delete(characterId);
  }

  public static hasOffers(characterId: string): boolean {
    return MissionOfferService.pending.has(characterId);
  }
}

export type { MissionOffersResponse };
