import type { GearSubType, ItemType } from './types';

export const GEAR_OFFSETS: Record<GearSubType, { x: number; y: number }> = {
    HEAD: { x: 33, y: -293 },
    SHOULDERS: { x: 1, y: -203 },
    CHEST: { x: 25, y: -136 },
    GAUNTLETS: { x: 31, y: -39 },
    LEGGINGS: { x: 11, y: 34 },
    BOOTS: { x: 23, y: 221 },
    WEAPON: { x: 0, y: 91 }
};

export const TYPE_LABELS: Record<ItemType, string> = {
  GEAR: 'Gear',
  MATERIAL: 'Materials',
  CONSUMABLE: 'Consumables',
};

export const TYPE_COLORS: Record<ItemType, string> = {
  GEAR: 'text-yellow-400',
  MATERIAL: 'text-emerald-400',
  CONSUMABLE: 'text-indigo-400',
};

export const TYPE_BORDER: Record<ItemType, string> = {
  GEAR: 'border-yellow-500/30',
  MATERIAL: 'border-emerald-500/30',
  CONSUMABLE: 'border-indigo-500/30',
};

export const RARITY_COLORS: Record<string, string> = {
  LOW: 'text-slate-400',
  MEDIUM: 'text-green-400',
  RARE: 'text-blue-400',
  VERY_RARE: 'text-purple-400',
};

export const RARITY_LABELS: Record<string, string> = {
  LOW: 'Common',
  MEDIUM: 'Uncommon',
  RARE: 'Rare',
  VERY_RARE: 'Very Rare',
};

export const RARITY_BG: Record<string, string> = {
  LOW: 'bg-slate-700/50',
  MEDIUM: 'bg-green-900/30',
  RARE: 'bg-blue-900/30',
  VERY_RARE: 'bg-purple-900/30',
};

export const SUBTYPE_LABEL: Record<string, string> = {
  // Gear
  HEAD: 'Head',
  SHOULDERS: 'Shoulders',
  CHEST: 'Chest',
  GAUNTLETS: 'Gauntlets',
  LEGGINGS: 'Leggings',
  BOOTS: 'Boots',
  WEAPON: 'Weapon',
  // Materials
  LUMBER: 'Lumber',
  MINERAL: 'Mineral',
  AGRICULTURE: 'Agri',
  HERB: 'Herb',
  // Potions
  HEALTH: 'Health',
  STAMINA: 'Stamina',
};

/**
 * Whitelisted mob animation keys used across client, admin, and server.
 * These match the capitalized keys found in the sprite atlas JSON files.
 */
export const MOB_ANIMATION_KEYS = [
  'Idle',
  'Attacking',
  'Defending',
  'TakingDamage',
  'Taunt',
  'Walking',
  'Death',
] as const;

export type MobAnimationKey = (typeof MOB_ANIMATION_KEYS)[number];
