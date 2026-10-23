import type { GameItem } from '../types';
import { sumEffects, type EffectEntry } from './combatStats';

/**
 * Backpack weight. Every item has a `weight` (per unit); the limit comes from the Carry Capacity effect on
 * equipped gear (like every other stat), on top of a base for a character with no gear. These pure helpers are
 * the one rule the server, client prediction and tests share.
 */

/** Weight limit of a character with no Carry Capacity effects at all. */
/** Stats a mining player gets from their equipment on top of the combat stats. */
export interface CarryStats {
  carryCapacity: number;
}

export const BASE_CARRY_CAPACITY = 100;

/** Capacity from the base plus every Carry Capacity effect in the lists (never below 0). */
export function deriveCarryCapacity(...lists: (readonly EffectEntry[] | null | undefined)[]): number {
  const bonus = sumEffects(lists.flatMap((list) => list ?? []), 'carryCapacityModifier');
  return Math.max(0, BASE_CARRY_CAPACITY + bonus);
}

/** Capacity from the equipped gear of a character's inventory. */
export function carryCapacityOfInventory(inventoryItems: readonly { item: GameItem; equipped?: boolean }[]): number {
  return deriveCarryCapacity(...inventoryItems.filter((entry) => entry.equipped).map((entry) => entry.item.itemEffects));
}

/** One stack in a backpack. */
export interface WeighedStack {
  itemId: string;
  quantity: number;
}

type WeightOf = { weight?: number | null } | null | undefined;
/** Where item weights come from: a map or record by item id, or a lookup function. */
export type WeightDefinitions = ReadonlyMap<string, WeightOf> | Readonly<Record<string, WeightOf>> | ((itemId: string) => WeightOf);

const weightOf = (itemDefs: WeightDefinitions, itemId: string): number => {
  const def =
    typeof itemDefs === 'function' ? itemDefs(itemId) : itemDefs instanceof Map ? itemDefs.get(itemId) : (itemDefs as Record<string, WeightOf>)[itemId];
  const weight = def?.weight;
  return typeof weight === 'number' && Number.isFinite(weight) && weight > 0 ? weight : 0;
};

/** Total weight of everything in the backpack (unknown items weigh nothing). */
export function backpackWeight(contents: readonly WeighedStack[], itemDefs: WeightDefinitions): number {
  let total = 0;
  for (const stack of contents) {
    if (stack.quantity > 0) total += weightOf(itemDefs, stack.itemId) * stack.quantity;
  }
  return total;
}

/** How many more units of `itemId` fit (Infinity for a weightless item, 0 when full or over). */
export function carryRoom(contents: readonly WeighedStack[], itemId: string, capacity: number, itemDefs: WeightDefinitions): number {
  const unit = weightOf(itemDefs, itemId);
  if (unit <= 0) return Infinity;
  const free = capacity - backpackWeight(contents, itemDefs);
  return free <= 0 ? 0 : Math.floor(free / unit + 1e-9);
}

/** True if `quantity` more of `itemId` fits under `capacity`. */
export function canCarry(contents: readonly WeighedStack[], itemId: string, quantity: number, capacity: number, itemDefs: WeightDefinitions): boolean {
  return quantity <= 0 || carryRoom(contents, itemId, capacity, itemDefs) >= quantity;
}

/**
 * Which stack to hand over next when emptying a backpack (to the extractor or onto the belt): the heaviest item per unit
 * first, since that empties the weight fastest, and the earliest picked up among equals. Returns an index into
 * `contents`, or -1 when nothing is left.
 */
export function nextUnloadIndex(contents: readonly WeighedStack[], itemDefs: WeightDefinitions): number {
  let best = -1;
  let bestWeight = -1;
  contents.forEach((stack, index) => {
    if (!(stack.quantity > 0)) return;
    const weight = weightOf(itemDefs, stack.itemId);
    if (weight > bestWeight) {
      best = index;
      bestWeight = weight;
    }
  });
  return best;
}
