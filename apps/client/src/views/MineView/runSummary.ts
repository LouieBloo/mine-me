import type { MiningBackpackItem, MissionResultView } from '@mine-me/shared';
import type { LootItemDescriptor } from '../../components/LootSpoilsModal/LootSpoilsModal';

/** XP the summary shows per looted item (a display estimate; the server grants what the items themselves carry). */
export const SUMMARY_XP_PER_ITEM = 5;

export interface RunSummary {
  sol: number;
  experience: number;
  items: LootItemDescriptor[];
}

/**
 * The totals on the Expedition Summary, the run's only end screen: the loot taken out plus whatever the mission paid (its Sol and
 * XP, and its items merged with the loot of the same kind). A mission that paid nothing (unfinished, failed) adds nothing.
 */
export function buildRunSummary(loot: readonly MiningBackpackItem[], mission: MissionResultView | null): RunSummary {
  const reward = mission?.reward ?? null;
  const merged = new Map<string, { itemId: string; itemName: string; iconUrl?: string | null; quantity: number }>();
  for (const item of [...loot, ...(reward?.items ?? [])]) {
    const held = merged.get(item.itemId);
    if (held) held.quantity += item.quantity;
    else merged.set(item.itemId, { itemId: item.itemId, itemName: item.itemName, iconUrl: item.iconUrl, quantity: item.quantity });
  }
  return {
    sol: reward?.sol ?? 0,
    experience: loot.reduce((sum, item) => sum + item.quantity * SUMMARY_XP_PER_ITEM, 0) + (reward?.xp ?? 0),
    items: [...merged.values()].map((item) => ({
      itemId: item.itemId,
      quantity: item.quantity,
      itemDetails: {
        id: item.itemId,
        name: item.itemName,
        description: 'A resource extracted from the dungeon mine.',
        iconUrl: item.iconUrl,
        type: 'MATERIAL',
        rarity: 'LOW',
      },
    })),
  };
}
