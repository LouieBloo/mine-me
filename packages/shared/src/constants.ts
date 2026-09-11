import type { GearSubType, ItemType } from './types';

// Legacy knight body gear offsets (deprecated in favor of modular character skeleton)
export const GEAR_OFFSETS: Record<GearSubType, { x: number; y: number }> = {
    HEAD: { x: 33, y: -293 },
    SHOULDERS: { x: 1, y: -203 },
    CHEST: { x: 25, y: -136 },
    GAUNTLETS: { x: 31, y: -39 },
    LEGGINGS: { x: 11, y: 34 },
    BOOTS: { x: 23, y: 221 },
    WEAPON: { x: 0, y: 91 }
};

export const MINER_SKELETON_PATH = '/assets/sprites/characters/miner/miner_skeleton.json';

export const MODULAR_GEAR_SLOTS: Record<GearSubType, string> = {
  HEAD: 'headNode',
  SHOULDERS: 'torsoNode',
  CHEST: 'torsoNode',
  GAUNTLETS: 'armFrontNode',
  LEGGINGS: 'pelvisNode',
  BOOTS: 'legFrontNode',
  WEAPON: 'toolSocket',
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

export const MODULAR_ANIMATION_STATES = [
  'idle',
  'walk',
  'mine',
  'attack',
  'damage',
  'death',
] as const;

/**
 * Whitelisted mob animation keys used across client, admin, and server.
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

export const DEFAULT_PARTICLE_EFFECTS = {
  torch_flame: {
    emitterType: 'continuous' as const,
    rate: 40,
    lifetime: { min: 0.35, max: 0.75 },
    speed: { min: 30, max: 80 },
    angle: { min: 260, max: 280 },
    gravity: { x: 0, y: -45 },
    friction: 0.98,
    scale: { start: 1.25, end: 0.15 },
    color: { start: '#fff6c2', end: '#ef4444' },
    alpha: { start: 0.95, end: 0.0 },
    blendMode: 'add' as const,
    shape: 'flame' as const,
    spawnRadius: 3,
    turbulence: 12,
  },
  campfire_blaze: {
    emitterType: 'continuous' as const,
    rate: 65,
    lifetime: { min: 0.5, max: 1.1 },
    speed: { min: 40, max: 110 },
    angle: { min: 250, max: 290 },
    gravity: { x: 0, y: -60 },
    friction: 0.97,
    scale: { start: 2.0, end: 0.25 },
    color: { start: '#ffffff', end: '#ea580c' },
    alpha: { start: 0.95, end: 0.0 },
    blendMode: 'add' as const,
    shape: 'flame' as const,
    spawnRadius: 8,
    turbulence: 18,
  },
  soul_fire: {
    emitterType: 'continuous' as const,
    rate: 40,
    lifetime: { min: 0.4, max: 0.85 },
    speed: { min: 30, max: 75 },
    angle: { min: 260, max: 280 },
    gravity: { x: 0, y: -40 },
    friction: 0.98,
    scale: { start: 1.3, end: 0.2 },
    color: { start: '#e0f2fe', end: '#0284c7' },
    alpha: { start: 0.9, end: 0.0 },
    blendMode: 'add' as const,
    shape: 'flame' as const,
    spawnRadius: 4,
    turbulence: 14,
  },
  toxic_flame: {
    emitterType: 'continuous' as const,
    rate: 40,
    lifetime: { min: 0.4, max: 0.8 },
    speed: { min: 25, max: 70 },
    angle: { min: 260, max: 280 },
    gravity: { x: 0, y: -35 },
    friction: 0.98,
    scale: { start: 1.2, end: 0.2 },
    color: { start: '#ecfccb', end: '#16a34a' },
    alpha: { start: 0.85, end: 0.0 },
    blendMode: 'add' as const,
    shape: 'flame' as const,
    spawnRadius: 4,
    turbulence: 10,
  },
  block_dirt_chip: {
    emitterType: 'burst' as const,
    burstCount: 5,
    lifetime: { min: 0.22, max: 0.45 },
    speed: { min: 25, max: 65 },
    angle: { min: 210, max: 330 },
    gravity: { x: 0, y: 160 },
    friction: 0.95,
    scale: { start: 0.65, end: 0.15 },
    color: { start: '#9a5823', end: '#3f1d0b' },
    alpha: { start: 0.9, end: 0.0 },
    blendMode: 'normal' as const,
    shape: 'crumb' as const,
    spawnRadius: 2,
  },
  block_dirt_hit: {
    emitterType: 'burst' as const,
    burstCount: 9,
    lifetime: { min: 0.3, max: 0.55 },
    speed: { min: 35, max: 85 },
    angle: { min: 190, max: 350 },
    gravity: { x: 0, y: 200 },
    friction: 0.95,
    scale: { start: 0.85, end: 0.2 },
    color: { start: '#9a5823', end: '#3f1d0b' },
    alpha: { start: 1.0, end: 0.0 },
    blendMode: 'normal' as const,
    shape: 'crumb' as const,
    spawnRadius: 4,
  },
  block_mineral_chip: {
    emitterType: 'burst' as const,
    burstCount: 5,
    lifetime: { min: 0.2, max: 0.45 },
    speed: { min: 30, max: 75 },
    angle: { min: 0, max: 360 },
    gravity: { x: 0, y: 100 },
    friction: 0.96,
    scale: { start: 0.7, end: 0.15 },
    color: { start: '#7dd3fc', end: '#f59e0b' },
    alpha: { start: 1.0, end: 0.0 },
    blendMode: 'add' as const,
    shape: 'spark' as const,
    spawnRadius: 2,
  },
  block_mineral_hit: {
    emitterType: 'burst' as const,
    burstCount: 12,
    lifetime: { min: 0.3, max: 0.65 },
    speed: { min: 50, max: 120 },
    angle: { min: 0, max: 360 },
    gravity: { x: 0, y: 140 },
    friction: 0.97,
    scale: { start: 0.9, end: 0.2 },
    color: { start: '#38bdf8', end: '#f59e0b' },
    alpha: { start: 1.0, end: 0.0 },
    blendMode: 'add' as const,
    shape: 'spark' as const,
    spawnRadius: 5,
  },
  enchanted_aura: {
    emitterType: 'continuous' as const,
    rate: 20,
    lifetime: { min: 0.6, max: 1.2 },
    speed: { min: 15, max: 40 },
    angle: { min: 0, max: 360 },
    gravity: { x: 0, y: -20 },
    friction: 0.99,
    scale: { start: 0.8, end: 0.1 },
    color: { start: '#c084fc', end: '#38bdf8' },
    alpha: { start: 0.9, end: 0.0 },
    blendMode: 'add' as const,
    shape: 'spark' as const,
    spawnRadius: 14,
  },
};
