import { MiningTileType, type MissionLookups, type MissionRequirements, deriveMissionRequirements, type MissionDefinition, type MissionRewardView, type RequirementContext } from '@mine-me/shared';
import type { MiningDataManager } from '../subsystems/MiningDataManager';

/** The game's content, as the mission rules want to ask about it (see OBJECTIVE_TYPES). `maxDepth` is the deepest row the map reaches. */
export function missionLookups(data: MiningDataManager, maxDepth?: number): MissionLookups {
  return {
    hasItem: (id) => Boolean(data.getItemData(id)),
    hasMob: (id) => Boolean(data.getMobData(id)),
    hasFluid: (id) => Boolean(data.getFluid(id)),
    hasGas: (id) => Boolean(data.getGas(id)),
    nameOf: (kind, id) => (kind === 'item' ? data.getItemData(id)?.name : kind === 'mob' ? data.getMobData(id)?.name : kind === 'fluid' ? data.getFluid(id)?.name : data.getGas(id)?.name),
    itemIsMineable: (id) => data.getBlocksDropping(id).length > 0,
    maxDepth,
  };
}

/** What the requirement derivation needs from the content tables. */
export function requirementContext(data: MiningDataManager): RequirementContext {
  return {
    blocksDropping: (itemId) => data.getBlocksDropping(itemId).map((b) => ({ typeKey: b.typeKey, expectedPerBlock: b.expectedPerBlock })),
    fluidTypeKey: (id) => data.getFluid(id)?.typeKey,
    gasTypeKey: (id) => data.getGas(id)?.typeKey,
  };
}

/** What a mission asks of the map it is played on (ticket 110). */
export function requirementsFor(mission: Pick<MissionDefinition, 'objectives'>, data: MiningDataManager): MissionRequirements {
  return deriveMissionRequirements(mission.objectives, requirementContext(data));
}

/** The reward as a player reads it: item names and icons resolved. */
export function rewardView(mission: Pick<MissionDefinition, 'rewardCoins' | 'rewardXp' | 'rewardItems'>, data: MiningDataManager): MissionRewardView {
  return {
    coins: mission.rewardCoins,
    xp: mission.rewardXp,
    items: (mission.rewardItems ?? []).map((r) => {
      const item = data.getItemData(r.itemId);
      return { itemId: r.itemId, itemName: item?.name ?? r.itemId, iconUrl: item?.iconUrl ?? null, chance: r.chance, minQuantity: r.minQuantity, maxQuantity: r.maxQuantity };
    }),
  };
}

/** Tile type for a block key is a MiningTileType number; kept here so the generator and the tests share one import. */
export type { MiningTileType };
